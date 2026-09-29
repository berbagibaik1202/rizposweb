$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$venvPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $venvPython)) {
    throw "Virtual environment belum ada. Jalankan setup.ps1 terlebih dahulu."
}

& $venvPython -m uvicorn server:app --host 127.0.0.1 --port 8000
