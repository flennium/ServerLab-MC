<#
.SYNOPSIS
  Stops ServerLab MC dev processes that commonly hold ports 3001 and 5173.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "..")).Path
$processStatePath = Join-Path $RepoRoot "data\dev-processes.json"
$ports = @(3001, 5173)
$processIds = New-Object System.Collections.Generic.HashSet[int]

function Test-ServerLabProcess($processInfo) {
  if (-not $processInfo -or -not $processInfo.CommandLine) {
    return $false
  }

  return $processInfo.CommandLine -like "*$RepoRoot*"
}

if (Test-Path -LiteralPath $processStatePath) {
  try {
    $state = Get-Content -LiteralPath $processStatePath -Raw | ConvertFrom-Json
    if ($state.repoRoot -eq $RepoRoot) {
      foreach ($entry in @($state.processes)) {
        if (-not $entry.pid) { continue }
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$entry.pid)" -ErrorAction SilentlyContinue
        if (Test-ServerLabProcess $processInfo) {
          [void]$processIds.Add([int]$entry.pid)
        }
      }
    }
  } catch {
    Write-Warning "Could not read the ServerLab dev process state file. Falling back to verified port owners."
  }
}

foreach ($port in $ports) {
  netstat -ano -p tcp |
    Select-String ":$port\s" |
    ForEach-Object {
      $parts = $_.Line.Trim() -split "\s+"
      if ($parts.Length -ge 5 -and $parts[3] -eq "LISTENING") {
        $pid = [int]$parts[4]
        $processInfo = Get-WmiObject Win32_Process -Filter "ProcessId=$pid" -ErrorAction SilentlyContinue
        if (Test-ServerLabProcess $processInfo) {
          [void]$processIds.Add($pid)
        }
      }
    }
}

foreach ($processId in $processIds) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if (-not $process) {
    continue
  }

  if ($PSCmdlet.ShouldProcess("$($process.ProcessName) ($processId)", "Stop ServerLab dev process")) {
    & taskkill.exe /PID $processId /T /F | Out-Null
  }
}

Remove-Item -LiteralPath $processStatePath -Force -ErrorAction SilentlyContinue

Write-Host "ServerLab MC dev processes stopped."
