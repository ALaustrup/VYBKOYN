# Start KOYN API + web without Docker (Windows PowerShell).
# Requires: server/.env with valid DATABASE_URL, and web/.env.local (copy from web/.env.example).

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "VYBKOY dev - applying Prisma schema..." -ForegroundColor Cyan
Push-Location (Join-Path $Root "server")
try {
  npx prisma db push
  if ($LASTEXITCODE -ne 0) { throw "prisma db push failed" }
} catch {
  Write-Host "Prisma failed. Check DATABASE_URL in server/.env" -ForegroundColor Red
  Pop-Location
  exit 1
}
Pop-Location

Write-Host "Starting API on :4000 and web on :3000 (new windows)..." -ForegroundColor Cyan
$serverCmd = "Set-Location '$Root\server'; npm run dev"
$webCmd = "Set-Location '$Root\web'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $serverCmd
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", $webCmd

Write-Host ""
Write-Host "  Web:  http://localhost:3000" -ForegroundColor Green
Write-Host "  API:  http://localhost:4000/health" -ForegroundColor Green
Write-Host "Close the two PowerShell windows to stop servers." -ForegroundColor Yellow
