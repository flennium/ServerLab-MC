<#
.SYNOPSIS
  Stops ServerLab MC dev processes that commonly hold ports 3001 and 5173.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "..")).Path
$ports = @(3001, 5173)
$processIds = New-Object System.Collections.Generic.HashSet[int]

function Test-ServerLabProcess($processInfo) {
  if (-not $processInfo -or -not $processInfo.CommandLine) {
    return $false
  }

  return (
    $processInfo.CommandLine -like "*$RepoRoot*" -or
    $processInfo.CommandLine -like "*ServerLab MC*" -or
    $processInfo.CommandLine -like "*serverlab-mc*" -or
    $processInfo.CommandLine -like "*apps\backend\dist\index.js*" -or
    $processInfo.CommandLine -like "*release\win-unpacked\resources\backend\dist\index.js*" -or
    $processInfo.CommandLine -like "*vite\bin\vite.js*"
  )
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

Get-WmiObject Win32_Process |
  Where-Object { Test-ServerLabProcess $_ } |
  ForEach-Object {
    [void]$processIds.Add([int]$_.ProcessId)
  }

foreach ($processId in $processIds) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if (-not $process) {
    continue
  }

  if ($PSCmdlet.ShouldProcess("$($process.ProcessName) ($processId)", "Stop ServerLab dev process")) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "ServerLab MC dev processes stopped."
