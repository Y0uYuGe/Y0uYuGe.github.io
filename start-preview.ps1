[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 4000,
    [switch]$BuildOnly
)

$ErrorActionPreference = 'Stop'
$blogRoot = $PSScriptRoot
$syncScript = Join-Path $blogRoot 'sync-projects.ps1'
$projectDocsConfig = Join-Path $blogRoot 'local/project-docs-config.yml'

if (-not (Test-Path -LiteralPath $syncScript -PathType Leaf)) {
    throw 'Missing sync-projects.ps1. Restore the tracked project publishing scripts before starting preview.'
}

Push-Location -LiteralPath $blogRoot
try {
    # Refresh publication rules before Jekyll can read the nested project trees.
    & $syncScript
    if (-not $?) {
        throw 'Project publication preparation failed. Preview was not started.'
    }
    if (-not (Test-Path -LiteralPath $projectDocsConfig -PathType Leaf)) {
        throw 'Project publication preparation did not generate local/project-docs-config.yml.'
    }

    if (-not $BuildOnly) {
        $portProbe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        try {
            $portProbe.Server.ExclusiveAddressUse = $true
            $portProbe.Start()
        }
        catch [System.Net.Sockets.SocketException] {
            Write-Host "Port $Port is already in use. A second preview server was not started."
            Write-Host "Existing preview: http://127.0.0.1:$Port/"
            Write-Host 'If publication rules changed, stop the existing preview in its terminal and run this script again.'
            Write-Host 'Use -Port <number> to choose another port. No process was stopped.'
            return
        }
        finally {
            $portProbe.Stop()
        }
    }

    $previewCache = Join-Path $env:USERPROFILE '.cache/blog-preview'
    $rubyCommand = Get-Command ruby -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty Source
    if (-not $rubyCommand -and (Test-Path -LiteralPath $previewCache -PathType Container)) {
        foreach ($rubyDirectory in (Get-ChildItem -LiteralPath $previewCache -Directory -Filter 'rubyinstaller-*' | Sort-Object Name -Descending)) {
            $rubyCandidate = Join-Path $rubyDirectory.FullName 'bin/ruby.exe'
            if (Test-Path -LiteralPath $rubyCandidate -PathType Leaf) {
                $rubyCommand = $rubyCandidate
                break
            }
        }
    }
    if (-not $rubyCommand) {
        throw 'Ruby was not found. Install Ruby and the Gemfile dependencies, or add Ruby to PATH.'
    }

    $previewGemfile = Join-Path $blogRoot 'local/Gemfile'
    if (-not (Test-Path -LiteralPath $previewGemfile -PathType Leaf)) {
        $previewGemfile = Join-Path $blogRoot 'Gemfile'
    }
    $cachedGems = Join-Path $previewCache 'gems'
    $env:PATH = (Split-Path -Parent $rubyCommand) + [System.IO.Path]::PathSeparator + $env:PATH
    $env:RUBYOPT = '-EUTF-8'
    $env:BUNDLE_GEMFILE = $previewGemfile
    if ((-not $env:BUNDLE_PATH) -and (Test-Path -LiteralPath $cachedGems -PathType Container)) {
        $env:BUNDLE_PATH = $cachedGems
    }

    # Same emoji compatibility adjustment as the former local/preview.rb.
    # Keep it in the tracked launcher so a fresh clone does not need that file.
    $rubyPreview = @'
require 'bundler/setup'
require 'jemoji'
require 'jekyll'
require File.expand_path('scripts/project-post-reader.rb', Dir.pwd)
require 'json'
require 'yaml'
require 'set'
emoji_filter = HTML::Pipeline::EmojiFilter
pattern = emoji_filter.emoji_pattern
emoji_filter.instance_variable_set(:@emoji_pattern, Regexp.new("(?>#{pattern.source})", pattern.options))

# This trusted launcher registers the audit before reading, including in --safe mode.
# Compare source paths, never output URLs: a project document may keep an old permalink.
Jekyll::Hooks.register :site, :post_read do |site|
  begin
    normalize = lambda do |path|
      value = path.to_s.encode(Encoding::UTF_8).tr('\\', '/').unicode_normalize(:nfc)
      value = value.sub(%r{\A/+}, '').sub(%r{\A(?:\./)+}, '').gsub(%r{/+}, '/')
      File::ALT_SEPARATOR == '\\' ? value.downcase : value
    end
    manifest = JSON.parse(File.read(site.in_source_dir('_data/project-workspaces.json'), encoding: 'bom|utf-8'))
    rules = YAML.safe_load(File.read(site.in_source_dir('local/project-docs-config.yml'), encoding: 'bom|utf-8'), aliases: false)
    roots = manifest.fetch('projects').map do |project|
      path = normalize.call(project.fetch('path')).sub(%r{/+\z}, '')
      unless path.start_with?('_posts/') && path.split('/').none? { |part| ['.', '..'].include?(part) }
        raise ArgumentError, "Invalid project source path: #{path}"
      end
      path
    end.to_set
    managed = lambda { |path| roots.any? { |root| path == root || path.start_with?(root + '/') } }
    allowed = Array(rules.fetch('include')).filter_map do |entry|
      next unless entry.is_a?(String) && entry.end_with?('[.]md')
      path = normalize.call('_posts/' + entry.sub(/\[\.\]md\z/, '.md'))
      path if managed.call(path)
    end.to_set
    actual = site.posts.docs.map { |doc| normalize.call(doc.relative_path) }
      .select { |path| managed.call(path) }.to_set
    leaked = (site.pages + site.static_files).map { |file| normalize.call(file.relative_path) }
      .select { |path| managed.call(path) }.to_set
    problems = []
    problems << "Unexpected project posts: #{(actual - allowed).to_a.sort.join(', ')}" unless actual.subset?(allowed)
    problems << "Missing approved project posts: #{(allowed - actual).to_a.sort.join(', ')}" unless allowed.subset?(actual)
    problems << "Project source exposed as pages/static files: #{leaked.to_a.sort.join(', ')}" unless leaked.empty?
    unless problems.empty?
      raise Jekyll::Errors::FatalException, "Project publication audit failed. #{problems.join('; ')}"
    end
  rescue Jekyll::Errors::FatalException
    raise
  rescue StandardError => error
    raise Jekyll::Errors::FatalException, "Project publication audit failed: #{error.class}: #{error.message}"
  end
end
load Gem.bin_path('jekyll', 'jekyll')
'@
    $jekyllConfig = '_config.yml,_config_local.yml,local/project-docs-config.yml'
    if ($BuildOnly) {
        $jekyllArguments = @('build', '--safe', '--config', $jekyllConfig)
        Write-Host 'Building the site with the generated project publication rules.'
    }
    else {
        $jekyllArguments = @('serve', '--safe', '--host', '127.0.0.1', '--port', [string]$Port,
            '--config', $jekyllConfig, '--force_polling')
        Write-Host "Preview: http://127.0.0.1:$Port/"
        Write-Host 'After changing a publication list, restart this launcher to regenerate its rules.'
    }
    & $rubyCommand '-e' $rubyPreview '--' @jekyllArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Jekyll exited with code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
