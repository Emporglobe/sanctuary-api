@echo off
setlocal

REM === Sanctuary API local runner (Windows) ===
cd /d %~dp0

REM If node_modules missing, install
if not exist node_modules (
  echo Installing dependencies...
  npm install
)

echo Starting server on http://localhost:3001 ...
npm run dev

endlocal
