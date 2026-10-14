<#
.SYNOPSIS
  One-shot machine setup for vibe coding on Windows (Git, Node.js, GitHub CLI, Python, ripgrep, jq, Claude Code),
  then installs the Tool_VibeCode kit into your Claude config.

.DESCRIPTION
  Safe by default: only installs what is missing, asks before installing, supports -DryRun.
  Needs winget (App Installer, included in Windows 11 and current Windows 10).
  This file is ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 without a BOM.

.PARAMETER Yes
  Do not ask for confirmation before installing missing tools.
.PARAMETER DryRun
  Show what would be installed and run the kit install in dry-run mode. Changes nothing.
.PARAMETER SkipKit
  Only install tools; do not install the kit into ~/.claude.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File setup\bootstrap.ps1 -DryRun
  powershell -ExecutionPolicy Bypass -File setup\bootstrap.ps1
#>
[CmdletBinding()]
param(
  [switch]$Yes,
  [switch]$DryRun,
  [switch]$SkipKit
)

$ErrorActionPreference = 'Stop'
$KitRoot = Split-Path -Parent $PSScriptRoot

function Test-Tool([string]$Command, [string[]]$VersionArgs = @('--version')) {
  # Run the tool instead of only looking it up: the Windows "python" Store alias exists but does not work.
  try {
    $null = & $Command @VersionArgs 2>$null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

function Update-SessionPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

$tools = @(
  @{ Name = 'Git';         Cmd = 'git';    Id = 'Git.Git' },
  @{ Name = 'Node.js LTS'; Cmd = 'node';   Id = 'OpenJS.NodeJS.LTS' },
  @{ Name = 'GitHub CLI';  Cmd = 'gh';     Id = 'GitHub.cli' },
  @{ Name = 'Python 3';    Cmd = 'python'; Id = 'Python.Python.3.13' },
  @{ Name = 'ripgrep';     Cmd = 'rg';     Id = 'BurntSushi.ripgrep.MSVC' },
  @{ Name = 'jq';          Cmd = 'jq';     Id = 'jqlang.jq' }
)

Write-Host ''
Write-Host '== Tool_VibeCode bootstrap ==' -ForegroundColor Cyan

$missing = @($tools | Where-Object { -not (Test-Tool $_.Cmd) })
if ($missing.Count -eq 0) {
  Write-Host 'All base tools are already installed.' -ForegroundColor Green
} else {
  Write-Host 'Missing tools:'
  $missing | ForEach-Object { Write-Host ("  - {0}  (winget id: {1})" -f $_.Name, $_.Id) }

  if (-not (Test-Tool 'winget' @('--version'))) {
    Write-Warning 'winget was not found. Install "App Installer" from the Microsoft Store, or install the tools above manually, then re-run this script.'
    exit 1
  }

  $go = $Yes
  if (-not $go -and -not $DryRun) {
    $answer = Read-Host 'Install the missing tools with winget now? (y/N)'
    $go = ($answer -match '^(y|yes)$')
  }

  foreach ($t in $missing) {
    if ($DryRun) {
      Write-Host ("[dry-run] winget install --id {0} -e --accept-package-agreements --accept-source-agreements" -f $t.Id)
    } elseif ($go) {
      Write-Host ("Installing {0} ..." -f $t.Name) -ForegroundColor Yellow
      & winget install --id $t.Id -e --accept-package-agreements --accept-source-agreements
      if ($LASTEXITCODE -ne 0) { Write-Warning ("winget reported exit code {0} for {1}; continuing." -f $LASTEXITCODE, $t.Name) }
    } else {
      Write-Host ("Skipped {0}." -f $t.Name)
    }
  }
  if (-not $DryRun) { Update-SessionPath }
}

# Claude Code CLI via npm (official package) when Node is available.
if (-not (Test-Tool 'claude')) {
  if ($DryRun) {
    Write-Host '[dry-run] npm install -g @anthropic-ai/claude-code'
  } elseif (Test-Tool 'npm') {
    Write-Host 'Installing Claude Code CLI ...' -ForegroundColor Yellow
    & npm install -g '@anthropic-ai/claude-code'
    Update-SessionPath
  } else {
    Write-Warning 'Claude Code CLI not installed (npm not available in this session). Open a new terminal and re-run, or see https://code.claude.com/docs.'
  }
}

if (-not $SkipKit) {
  if (-not (Test-Tool 'node')) {
    Write-Warning 'Node.js is not available in this session yet. Open a NEW terminal and run: node bin/vibe.mjs install'
    exit 1
  }
  Push-Location $KitRoot
  try {
    if ($DryRun) { & node bin/vibe.mjs install --dry-run } else { & node bin/vibe.mjs install }
    Write-Host ''
    & node bin/vibe.mjs doctor
  } finally {
    Pop-Location
  }
}

Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Cyan
Write-Host '  1. gh auth login            (if the doctor shows GitHub CLI is not logged in)'
Write-Host '  2. claude                   (first run: sign in)'
Write-Host '  3. node bin/vibe.mjs new <folder>   or open a project and run /vibe-start'
