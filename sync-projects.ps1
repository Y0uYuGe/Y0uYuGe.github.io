[CmdletBinding()]
param(
    [switch]$Download,
    [switch]$Stage,
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$rubyCommand = Get-Command ruby -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($rubyCommand) {
    $ruby = $rubyCommand.Source
} else {
    $ruby = Get-ChildItem -Path (Join-Path $env:USERPROFILE '.cache/blog-preview/rubyinstaller-*/bin/ruby.exe') -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}

if (-not $ruby) {
    throw 'Ruby was not found. Install Ruby or use the existing blog preview Ruby runtime.'
}

$docs = Join-Path $PSScriptRoot 'scripts/project-docs.rb'
$checkout = Join-Path $PSScriptRoot 'scripts/checkout-projects.rb'
$docsArguments = @()
if ($Stage) { $docsArguments += '--stage' }
if ($Check) { $docsArguments += '--check' }

function Get-EnabledUserProxy {
    $settings = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
    if (-not $settings -or $settings.ProxyEnable -ne 1 -or -not $settings.ProxyServer) { return @{} }

    $server = [string]$settings.ProxyServer
    $addresses = @{}
    if ($server.Contains('=')) {
        foreach ($part in $server.Split(';')) {
            $pair = $part.Split('=', 2)
            if ($pair.Count -eq 2 -and $pair[0].Trim() -in @('http', 'https')) {
                $addresses[$pair[0].Trim().ToLowerInvariant()] = $pair[1].Trim()
            }
        }
    } else {
        $addresses['http'] = $server.Trim()
        $addresses['https'] = $server.Trim()
    }

    $result = @{}
    foreach ($scheme in @('http', 'https')) {
        if (-not $addresses.ContainsKey($scheme)) { continue }
        $address = $addresses[$scheme]
        if ($address -notmatch '^[a-zA-Z][a-zA-Z0-9+.-]*://') { $address = 'http://' + $address }
        $proxyUri = $null
        if ([Uri]::TryCreate($address, [UriKind]::Absolute, [ref]$proxyUri) -and
            $proxyUri.Scheme -in @('http', 'https') -and $proxyUri.Host -and
            -not $proxyUri.Query -and -not $proxyUri.Fragment) {
            $result[$scheme] = $address
        }
    }
    return $result
}

$savedProxy = @{}
Push-Location -LiteralPath $PSScriptRoot
try {
    if ($Download) {
        # Prepare the source exclusions before creating any nested checkout.
        & $ruby $docs
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

        # Git does not read the enabled Windows user proxy automatically.
        # Respect explicit process proxy settings and restore any additions.
        if (-not [Environment]::GetEnvironmentVariable('HTTPS_PROXY', 'Process') -and
            -not [Environment]::GetEnvironmentVariable('https_proxy', 'Process')) {
            $userProxy = Get-EnabledUserProxy
            foreach ($scheme in @('http', 'https')) {
                $variable = $scheme + '_proxy'
                if ($userProxy.ContainsKey($scheme) -and -not [Environment]::GetEnvironmentVariable($variable, 'Process')) {
                    $savedProxy[$variable] = [Environment]::GetEnvironmentVariable($variable, 'Process')
                    [Environment]::SetEnvironmentVariable($variable, $userProxy[$scheme], 'Process')
                }
            }
        }

        & $ruby $checkout
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

        if ($docsArguments.Count -gt 0) {
            & $ruby $docs @docsArguments
            exit $LASTEXITCODE
        }
        exit 0
    }

    & $ruby $docs @docsArguments
    exit $LASTEXITCODE
} finally {
    foreach ($variable in $savedProxy.Keys) {
        if ($null -eq $savedProxy[$variable]) {
            Remove-Item -LiteralPath ('Env:' + $variable) -ErrorAction SilentlyContinue
        } else {
            [Environment]::SetEnvironmentVariable($variable, $savedProxy[$variable], 'Process')
        }
    }
    Pop-Location
}
