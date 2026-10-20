#!/usr/bin/env ruby
# frozen_string_literal: true

require 'fileutils'
require 'json'
require 'open3'
require 'tmpdir'

# Only these public repositories may be downloaded by the manifest entry point.
class ProjectCheckouts
  ALLOWED_REPOSITORIES = %w[
    Y0uYuGe/aicode-in-the-wild-security-risk-report
    Y0uYuGe/AI_Study_Note
    Y0uYuGe/cs408-computer-networks
    Y0uYuGe/cs408-computer-organization
    Y0uYuGe/cs408-data-structures
    Y0uYuGe/cs408-operating-systems
    Y0uYuGe/glibc-chunk-poc-basic
    Y0uYuGe/Graphrag_LLama3.2-class-project
    Y0uYuGe/IoT_Security_Learning
    Y0uYuGe/kernel-struct-exploit
    Y0uYuGe/learning-cxx
    Y0uYuGe/learning-lm-rs
    Y0uYuGe/llkchatroom
    Y0uYuGe/llkdocker
    Y0uYuGe/MagicSkills
    Y0uYuGe/nmap_ids
    Y0uYuGe/risllkos-advanced
    Y0uYuGe/risllkos-base
    Y0uYuGe/rustlings
    Y0uYuGe/sextant
    Narwhal-Lab/MagicSkills
  ].freeze
  DATE_MARKDOWN = /\A\d{4}-\d{2}-\d{2}-.+\.(?:md|markdown)\z/i

  class CheckoutError < StandardError; end

  def initialize(blog_root:, out: $stdout)
    @root = File.realpath(blog_root)
    @posts = File.join(@root, '_posts')
    @out = out
  end

  def run
    projects = read_projects
    prepare_local_directories
    failures = 0
    projects.each do |project|
      begin
        result = synchronize(project)
        failures += 1 if result == :dirty
      rescue StandardError => error
        failures += 1
        @out.puts "[ERROR] #{project.fetch('repository')}: #{error.message}"
      end
    end
    @out.puts "Projects checked: #{projects.length}; preserved or failed: #{failures}."
    failures.zero? ? 0 : 1
  rescue CheckoutError, SystemCallError => error
    @out.puts "[ERROR] #{error.message}"
    1
  end

  private

  def same_path?(left, right)
    if Gem.win_platform?
      left.tr('\\', '/').downcase == right.tr('\\', '/').downcase
    else
      left == right
    end
  end

  def within?(candidate, parent)
    candidate = candidate.tr('\\', '/')
    parent = parent.tr('\\', '/')
    if Gem.win_platform?
      candidate = candidate.downcase
      parent = parent.downcase
    end
    candidate == parent || candidate.start_with?("#{parent}/")
  end

  # Resolve every existing ancestor, including Windows directory junctions.
  def validate_path(path, boundary)
    expanded = File.expand_path(path)
    raise CheckoutError, 'A path leaves its permitted directory.' unless within?(expanded, boundary)

    current = expanded
    loop do
      if File.exist?(current) || File.symlink?(current)
        resolved = File.realpath(current)
        raise CheckoutError, 'A linked path leaves its permitted directory.' unless within?(resolved, boundary)
        raise CheckoutError, 'Linked checkout paths are not supported.' unless same_path?(resolved, current)
      end
      break if same_path?(current, boundary)

      parent = File.dirname(current)
      raise CheckoutError, 'A path has no permitted parent.' if same_path?(parent, current)
      current = parent
    end
    expanded
  end

  def read_projects
    raise CheckoutError, 'The blog _posts directory is missing.' unless File.directory?(@posts)
    raise CheckoutError, 'The blog _posts directory must be local.' unless same_path?(File.realpath(@posts), @posts)

    begin
      data = JSON.parse(File.read(File.join(@root, '_data', 'project-workspaces.json'), encoding: 'UTF-8'))
    rescue JSON::ParserError
      raise CheckoutError, 'The project manifest is not valid JSON.'
    end
    unless data.is_a?(Hash) && data['version'] == 1 && data['projects'].is_a?(Array)
      raise CheckoutError, 'The project manifest must have version 1 and a projects array.'
    end

    repositories = []
    paths = []
    data['projects'].map do |project|
      raise CheckoutError, 'A project manifest entry is invalid.' unless project.is_a?(Hash)
      repository = project['repository']
      unless ALLOWED_REPOSITORIES.include?(repository)
        raise CheckoutError, 'The manifest contains a repository outside the public download allowlist.'
      end
      relative = project['path']
      components = relative.is_a?(String) ? relative.split('/', -1) : []
      unless components.length >= 3 && components.first == '_posts' &&
             components.drop(1).all? { |part| part.match?(/\A[A-Za-z0-9][A-Za-z0-9._-]*\z/) && part != '..' }
        raise CheckoutError, "Invalid _posts path for #{repository}."
      end
      branch = project['branch']
      unless branch.is_a?(String) && branch.match?(/\A[A-Za-z0-9][A-Za-z0-9._\/-]*\z/)
        raise CheckoutError, "Invalid branch for #{repository}."
      end
      unless [true, false].include?(project['fork'])
        raise CheckoutError, "Invalid fork flag for #{repository}."
      end
      if repositories.include?(repository.downcase) || paths.include?(relative.downcase)
        raise CheckoutError, 'The manifest repeats a repository or checkout path.'
      end
      if paths.any? { |path| path.start_with?("#{relative.downcase}/") || relative.downcase.start_with?("#{path}/") }
        raise CheckoutError, 'Project checkout paths must not contain each other.'
      end
      repositories << repository.downcase
      paths << relative.downcase
      target = validate_path(File.join(@root, relative), @posts)
      project.merge('target' => target)
    end
  end

  def prepare_local_directories
    local = validate_path(File.join(@root, 'local'), @root)
    FileUtils.mkdir_p(local)
    @staging_parent = validate_path(File.join(local, 'project-checkouts'), local)
    @hooks = validate_path(File.join(local, 'project-checkout-empty-hooks'), local)
    FileUtils.mkdir_p(@staging_parent)
    FileUtils.mkdir_p(@hooks)
    unless Dir.empty?(@hooks)
      raise CheckoutError, 'The checkout hook suppression directory must be empty.'
    end
  end

  def git(*arguments, chdir:, allow_failure: false)
    environment = {
      'GIT_TERMINAL_PROMPT' => '0',
      'GCM_INTERACTIVE' => 'never',
      'GIT_ASKPASS' => nil,
      'SSH_ASKPASS' => nil,
      'GIT_SSH_COMMAND' => 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes',
      'GIT_LFS_SKIP_SMUDGE' => '1'
    }
    stdout, _stderr, status = Open3.capture3(
      environment, 'git',
      '-c', "core.hooksPath=#{@hooks}",
      '-c', 'core.longpaths=true',
      '-c', 'core.fsmonitor=false',
      '-c', 'credential.interactive=false',
      '-c', 'submodule.recurse=false',
      '-c', 'fetch.recurseSubmodules=false',
      '-c', 'maintenance.auto=false',
      '-c', 'protocol.ext.allow=never',
      *arguments, chdir: chdir
    )
    unless status.success? || allow_failure
      # Captured Git output may contain credential-bearing URLs. Do not print it.
      raise CheckoutError, "git #{arguments.first} failed (exit #{status.exitstatus}); existing files were preserved."
    end
    [stdout, status]
  end

  def synchronize(project)
    target = validate_path(project.fetch('target'), @posts)
    _output, branch_status = git('check-ref-format', '--branch', project.fetch('branch'), chdir: @root, allow_failure: true)
    raise CheckoutError, 'The configured branch is not a valid Git branch.' unless branch_status.success?

    git_path = File.join(target, '.git')
    if File.directory?(target) && (File.exist?(git_path) || File.symlink?(git_path))
      update_checkout(project)
    else
      clone_checkout(project)
    end
  end

  def canonical_repository(url)
    match = url.match(%r{\Ahttps://github\.com/([^/]+)/([^/]+?)(?:\.git)?/?\z}i) ||
            url.match(%r{\Agit@github\.com:([^/]+)/([^/]+?)(?:\.git)?\z}i) ||
            url.match(%r{\Assh://git@github\.com/([^/]+)/([^/]+?)(?:\.git)?/?\z}i)
    return unless match
    return unless match[1].match?(/\A[A-Za-z0-9-]+\z/) && match[2].match?(/\A[A-Za-z0-9_.-]+\z/)

    "#{match[1]}/#{match[2]}".downcase
  end

  def verify_checkout(project, target)
    git_path = File.join(target, '.git')
    unless File.directory?(git_path) && !File.symlink?(git_path) && same_path?(File.realpath(git_path), git_path)
      raise CheckoutError, 'The destination must contain an independent local .git directory.'
    end
    top, = git('rev-parse', '--show-toplevel', chdir: target)
    actual_git, = git('rev-parse', '--absolute-git-dir', chdir: target)
    common_git, = git('rev-parse', '--path-format=absolute', '--git-common-dir', chdir: target)
    unless same_path?(File.realpath(top.strip), File.realpath(target)) &&
           same_path?(File.realpath(actual_git.strip), git_path) && same_path?(File.realpath(common_git.strip), git_path)
      raise CheckoutError, 'The destination is not an independent checkout of this directory.'
    end
    remotes, = git('config', '--get-all', 'remote.origin.url', chdir: target)
    urls = remotes.lines.map(&:strip)
    unless urls.length == 1 && canonical_repository(urls.first) == project.fetch('repository').downcase
      raise CheckoutError, 'origin does not match the manifest; the checkout was preserved.'
    end
    branch, = git('symbolic-ref', '--quiet', '--short', 'HEAD', chdir: target)
    unless branch.strip == project.fetch('branch')
      raise CheckoutError, 'The current branch does not match the manifest; the checkout was preserved.'
    end
  end

  def date_markdown_names(target)
    return [] unless File.directory?(target)

    Dir.children(target).select do |name|
      next false unless name.match?(DATE_MARKDOWN)
      unless File.lstat(File.join(target, name)).file?
        raise CheckoutError, 'A dated blog Markdown entry must be a regular file.'
      end
      true
    end
  end

  def ignore_blog_documents(target)
    names = date_markdown_names(target)
    return if names.empty?

    git_path = File.join(target, '.git')
    info = validate_path(File.join(git_path, 'info'), git_path)
    FileUtils.mkdir_p(info)
    exclude = validate_path(File.join(info, 'exclude'), git_path)
    if File.exist?(exclude) && !File.lstat(exclude).file?
      raise CheckoutError, 'The local Git exclude file must be a regular file.'
    end
    existing = File.exist?(exclude) ? File.binread(exclude) : ''.b
    lines = existing.lines.map { |line| line.chomp.b }
    additions = names.sort.map do |name|
      escaped = name.gsub(/[\\*?\[\] ]/) { |character| "\\#{character}" }
      "/#{escaped}".b
    end.reject { |line| lines.include?(line) }
    return if additions.empty?

    File.open(exclude, 'ab') do |file|
      file.write("\n") unless existing.empty? || existing.end_with?("\n")
      additions.each { |line| file.write("#{line}\n") }
    end
  end

  def reject_remote_document_conflicts(target, reference)
    documents = date_markdown_names(target).map(&:downcase)
    return if documents.empty?

    tree, = git('ls-tree', '--name-only', '-z', reference, chdir: target)
    if tree.split("\0").any? { |name| documents.include?(name.downcase) }
      raise CheckoutError, 'A remote file conflicts with an existing dated blog document; all files were preserved.'
    end
  end

  def dirty_count(target)
    status, = git('status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none', chdir: target)
    records = status.split("\0")
    count = 0
    until records.empty?
      entry = records.shift
      count += 1
      records.shift if entry[0, 2].match?(/[RC]/)
    end
    count
  end

  def update_checkout(project)
    target = project.fetch('target')
    verify_checkout(project, target)
    ignore_blog_documents(target)
    count = dirty_count(target)
    if count.positive?
      @out.puts "[PRESERVED] #{project.fetch('repository')}: #{count} local change(s); no fetch or merge."
      return :dirty
    end

    git('fetch', '--no-tags', '--no-recurse-submodules', 'origin', project.fetch('branch'), chdir: target)
    reject_remote_document_conflicts(target, 'FETCH_HEAD')
    git('merge', '--ff-only', '--no-edit', 'FETCH_HEAD', chdir: target)
    ignore_blog_documents(target)
    @out.puts "[OK] #{project.fetch('repository')}: checked and updated with fast-forward only."
    :updated
  end

  def validate_document_only_destination(target)
    validate_path(target, @posts)
    return unless File.exist?(target) || File.symlink?(target)
    raise CheckoutError, 'The checkout destination is not a directory.' unless File.directory?(target)

    documents = date_markdown_names(target)
    unless (Dir.children(target) - documents).empty?
      raise CheckoutError, 'The destination has files other than dated blog Markdown; all files were preserved.'
    end
  end

  def clone_checkout(project)
    target = project.fetch('target')
    validate_document_only_destination(target)
    stage = Dir.mktmpdir("#{project.fetch('repository').split('/').last}-", @staging_parent)
    begin
      git('clone', '--config', 'core.longpaths=true', '--single-branch', '--branch', project.fetch('branch'), '--no-tags', '--no-recurse-submodules',
          '--', "https://github.com/#{project.fetch('repository')}.git", stage, chdir: @root)
      verify_checkout(project, stage)
      validate_document_only_destination(target)
      sources = Dir.children(stage)
      existing_names = File.directory?(target) ? Dir.children(target).map(&:downcase) : []
      if sources.any? { |name| existing_names.include?(name.downcase) }
        raise CheckoutError, 'A cloned file conflicts with an existing blog document; all files were preserved.'
      end

      FileUtils.mkdir_p(validate_path(target, @posts))
      # Install Git metadata last. A partial failure retains both locations.
      sources.sort_by { |name| name == '.git' ? 1 : 0 }.each do |name|
        destination = File.join(target, name)
        if File.exist?(destination) || File.symlink?(destination)
          raise CheckoutError, 'A destination entry appeared during installation; all remaining files were preserved.'
        end
        File.rename(File.join(stage, name), destination)
      end
      ignore_blog_documents(target)
      @out.puts "[OK] #{project.fetch('repository')}: independent checkout installed; blog documents preserved."
      :cloned
    rescue StandardError
      @out.puts "[RETAINED] Temporary checkout: #{stage.delete_prefix("#{@root}#{File::SEPARATOR}")}"
      raise
    end
  end
end

if $PROGRAM_NAME == __FILE__
  unless ARGV.empty?
    warn 'Usage: ruby scripts/checkout-projects.rb'
    exit 1
  end
  # Dir.pwd retains Unicode on Windows installations whose script __dir__ does not.
  # sync-projects.ps1 always invokes this entry point from the blog root.
  exit ProjectCheckouts.new(blog_root: Dir.pwd).run
end
