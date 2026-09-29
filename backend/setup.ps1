$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $backendRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    py -3.11 -m venv (Join-Path $backendRoot ".venv")
}

& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r (Join-Path $backendRoot "requirements.txt")

Write-Host "Backend siap. Gunakan .\.venv\Scripts\python.exe untuk migrate.py dan uvicorn."
