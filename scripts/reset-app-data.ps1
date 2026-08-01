<#
.SYNOPSIS
  Deletes ServerLab MC runtime data so the app starts with a clean test state.

.DESCRIPTION
  This removes generated app data only:
    - repo dev data under data/
    - old stray dev data paths listed in .gitignore
    - packaged Electron userData folders under AppData

  It does not delete source files, node_modules, builds, releases, or server folders
  that you manually selected when creating a server profile.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/reset-app-data.ps1 -WhatIf

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/reset-app-data.ps1 -Force
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$Force,
  [switch]$StopProcesses
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")

function Resolve-ExistingPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (Test-Path -LiteralPath $Path) {
    return (Resolve-Path -LiteralPath $Path).Path
  }

  return $null
}

function Remove-DirectoryContentsPreservingGitkeep {
  param([Parameter(Mandatory = $true)][string]$Directory)

  $resolved = Resolve-ExistingPath $Directory
  if (-not $resolved) {
    return
  }

  Get-ChildItem -LiteralPath $resolved -Force | ForEach-Object {
    if ($_.Name -eq ".gitkeep") {
      return
    }

    if ($PSCmdlet.ShouldProcess($_.FullName, "Remove generated app data")) {
      Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
  }
}

function Remove-ExactDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$Directory,
    [Parameter(Mandatory = $true)][string[]]$AllowedLeafNames
  )

  $resolved = Resolve-ExistingPath $Directory
  if (-not $resolved) {
    return
  }

  $leaf = Split-Path -Leaf $resolved
  if ($AllowedLeafNames -notcontains $leaf) {
    throw "Refusing to delete '$resolved' because '$leaf' is not in the allowed app-data name list."
  }

  if ($PSCmdlet.ShouldProcess($resolved, "Remove ServerLab MC app-data directory")) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}

if ($StopProcesses) {
  $processNames = @("ServerLab MC", "serverlab-mc")
  foreach ($name in $processNames) {
    Get-Process -ErrorAction SilentlyContinue |
      Where-Object { $_.ProcessName -eq $name -or $_.MainWindowTitle -like "*ServerLab MC*" } |
      ForEach-Object {
        if ($PSCmdlet.ShouldProcess($_.ProcessName, "Stop running ServerLab MC related process")) {
          Stop-Process -Id $_.Id -Force
        }
      }
  }
}

if (-not $Force -and -not $WhatIfPreference) {
  Write-Host "This will delete ServerLab MC generated test data from dev and AppData locations."
  Write-Host "It will not delete this repository, node_modules, build output, or manually chosen server folders."
  $answer = Read-Host "Type RESET to continue"
  if ($answer -ne "RESET") {
    Write-Host "Cancelled."
    exit 0
  }
}

$devDataDir = Join-Path $RepoRoot "data"
$oldBackendBackups = Join-Path $RepoRoot "apps\backend\backups"
$oldAppsData = Join-Path $RepoRoot "apps\data"
$backendPrismaDir = Join-Path $RepoRoot "apps\backend\prisma"

Write-Host "Resetting dev data..."
Remove-DirectoryContentsPreservingGitkeep $devDataDir
Remove-ExactDirectory $oldBackendBackups @("backups")
Remove-ExactDirectory $oldAppsData @("data")

Get-ChildItem -LiteralPath $backendPrismaDir -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match "\.db(-journal)?$" -or $_.Name -eq "prisma" } |
  ForEach-Object {
    if ($PSCmdlet.ShouldProcess($_.FullName, "Remove old Prisma dev data")) {
      Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
  }

Write-Host "Resetting packaged AppData..."
$appDataCandidates = @()
if ($env:APPDATA) {
  $appDataCandidates += Join-Path $env:APPDATA "ServerLab MC"
  $appDataCandidates += Join-Path $env:APPDATA "serverlab-mc"
  $appDataCandidates += Join-Path $env:APPDATA "ServerLab-MC"
}
if ($env:LOCALAPPDATA) {
  $appDataCandidates += Join-Path $env:LOCALAPPDATA "ServerLab MC"
  $appDataCandidates += Join-Path $env:LOCALAPPDATA "serverlab-mc"
  $appDataCandidates += Join-Path $env:LOCALAPPDATA "ServerLab-MC"
}

$allowedAppDataNames = @("ServerLab MC", "serverlab-mc", "ServerLab-MC")
$appDataCandidates |
  Select-Object -Unique |
  ForEach-Object {
    Remove-ExactDirectory $_ $allowedAppDataNames
  }

if (-not $WhatIfPreference) {
  New-Item -ItemType Directory -Force -Path (Join-Path $devDataDir "backups") | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $devDataDir "logs") | Out-Null
  New-Item -ItemType File -Force -Path (Join-Path $devDataDir ".gitkeep") | Out-Null
  New-Item -ItemType File -Force -Path (Join-Path $devDataDir "backups\.gitkeep") | Out-Null
}

if ($WhatIfPreference) {
  Write-Host "ServerLab MC app data reset preview complete. Nothing was deleted."
} else {
  Write-Host "ServerLab MC app data reset complete."
}
