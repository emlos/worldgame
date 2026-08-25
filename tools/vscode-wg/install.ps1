[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$extensionRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest = Get-Content -LiteralPath (Join-Path $extensionRoot "package.json") -Raw | ConvertFrom-Json
$extensionsRoot = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".vscode\extensions"
$folderName = "$($manifest.publisher).$($manifest.name)-$($manifest.version)"
$destination = Join-Path $extensionsRoot $folderName
$syntaxDestination = Join-Path $destination "syntaxes"

New-Item -ItemType Directory -Path $syntaxDestination -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $extensionRoot "package.json") -Destination $destination -Force
Copy-Item -LiteralPath (Join-Path $extensionRoot "language-configuration.json") -Destination $destination -Force
Copy-Item -LiteralPath (Join-Path $extensionRoot "syntaxes\wg.tmLanguage.json") -Destination $syntaxDestination -Force

Write-Host "Installed $($manifest.displayName) $($manifest.version) to:"
Write-Host $destination
Write-Host "Reload any open VS Code window to activate WG highlighting."
