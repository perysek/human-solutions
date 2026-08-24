<#
.SYNOPSIS
    Starts the local dev environment: PostgreSQL check, Flask backend, Vite frontend.

.DESCRIPTION
    - Verifies the local postgresql-x64-16 service is running (starts it if not).
    - Launches `python run_dev.py` (Flask, http://localhost:5001) in its own window.
    - Launches `npm run dev` (Vite, http://localhost:5173) in its own window.

.USAGE
    From the repo root:
        .\dev.ps1
#>

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# --- 1. PostgreSQL -----------------------------------------------------
$pg = Get-Service -Name 'postgresql-x64-16' -ErrorAction SilentlyContinue
if (-not $pg) {
    Write-Warning "Service 'postgresql-x64-16' not found. Is PostgreSQL 16 installed? Skipping DB check."
} elseif ($pg.Status -ne 'Running') {
    Write-Host "Starting PostgreSQL service..." -ForegroundColor Yellow
    Start-Service -Name 'postgresql-x64-16'
    Write-Host "PostgreSQL started." -ForegroundColor Green
} else {
    Write-Host "PostgreSQL already running." -ForegroundColor Green
}

# --- 2. Backend (Flask, port 5001) --------------------------------------
Write-Host "Starting backend (Flask)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$root'; python run_dev.py"
)

# --- 3. Frontend (Vite, port 5173) --------------------------------------
Write-Host "Starting frontend (Vite)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$root\frontend'; npm run dev"
)

Write-Host ""
Write-Host "Backend:  http://localhost:5001" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Green
