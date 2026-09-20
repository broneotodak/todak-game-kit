# Todak Workbench installer — Windows (PowerShell). Demonstrator, not the kit.
# Run:  powershell -ExecutionPolicy Bypass -File install.ps1
$ErrorActionPreference = "Stop"
$Kit = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Write-Host "Todak Workbench installer · kit at $Kit"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node 18+ is required (https://nodejs.org)" }
if (-not (Get-Command code -ErrorAction SilentlyContinue)) { throw "VS Code's 'code' command is required (tick 'Add to PATH' in the VS Code installer)" }
foreach ($ext in @("anthropic.claude-code","openai.chatgpt","geequlim.godot-tools")) { code --install-extension $ext --force | Out-Null; Write-Host "  extension: $ext" }
$vsix = Get-ChildItem (Join-Path $Kit "workbench\todak-sidebar") -Filter *.vsix -ErrorAction SilentlyContinue | Select-Object -First 1
if ($vsix) { code --install-extension $vsix.FullName --force | Out-Null; Write-Host "  extension: Todak sidebar" } else { Write-Host "  (Todak sidebar .vsix not built yet)" }
$GodotDir = Join-Path $env:USERPROFILE ".todak\godot"; New-Item -ItemType Directory -Force -Path $GodotDir | Out-Null
$GodotExe = Join-Path $GodotDir "Godot_v4.7.2-stable_win64.exe"
if (-not (Test-Path $GodotExe)) {
  Write-Host "  downloading Godot 4.7.2 for Windows…"
  Invoke-WebRequest -Uri "https://github.com/godotengine/godot/releases/download/4.7.2-stable/Godot_v4.7.2-stable_win64.exe.zip" -OutFile "$env:TEMP\godot.zip"
  Expand-Archive -Force "$env:TEMP\godot.zip" $GodotDir; Remove-Item "$env:TEMP\godot.zip"
}
$T = Join-Path $env:APPDATA "Godot\export_templates\4.7.2.stable"
if (-not (Test-Path (Join-Path $T "web_nothreads_release.zip"))) {
  Write-Host "  downloading the web export templates (about 1 GB, one time)…"; New-Item -ItemType Directory -Force -Path $T | Out-Null
  Invoke-WebRequest -Uri "https://github.com/godotengine/godot/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz" -OutFile "$env:TEMP\tpz.zip"
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead("$env:TEMP\tpz.zip")
  foreach ($e in $zip.Entries) { if ($e.FullName -like "templates/web_*" -or $e.FullName -eq "templates/version.txt") { [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path $T $e.Name), $true) } }
  $zip.Dispose(); Remove-Item "$env:TEMP\tpz.zip"
}
[Environment]::SetEnvironmentVariable("GODOT_BIN", $GodotExe, "User")
[Environment]::SetEnvironmentVariable("TGK_KIT", "$Kit", "User")
if ($env:TGK_INGEST_TOKEN) { [Environment]::SetEnvironmentVariable("TGK_INGEST_TOKEN", $env:TGK_INGEST_TOKEN, "User") } else { Write-Host "  (no TGK_INGEST_TOKEN in the environment: prompts stay local until it is set as a user variable)" }
$path = [Environment]::GetEnvironmentVariable("Path", "User"); if ($path -notlike "*$Kit\bin*") { [Environment]::SetEnvironmentVariable("Path", "$path;$Kit\bin", "User") }
Set-Content (Join-Path $Kit "bin\tgk.cmd") "@echo off`r`nnode `"%~dp0tgk.mjs`" %*"
Write-Host "Done. Open a new terminal, then: tgk new pong my-pong --student <name> --week 3 ; code my-pong"
Write-Host "Import the profile once: VS Code → Profiles → Import → $Kit\workbench\profile\todak-workbench.code-profile.json"
