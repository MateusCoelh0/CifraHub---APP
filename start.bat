@echo off
REM ╔════════════════════════════════════════════════════════════╗
REM ║       CIFRAHUB - Script de Inicialização (Windows)          ║
REM ╚════════════════════════════════════════════════════════════╝

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║    🎸 CIFRAHUB - Show ao Vivo 🎸                          ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Verificar se Node.js está instalado
node --version >nul 2>&1
if errorlevel 1 (
  echo ❌ Node.js não encontrado! Instale em: https://nodejs.org
  pause
  exit /b 1
)

echo ✓ Node.js detectado
echo.

REM Verificar se node_modules existe
if not exist node_modules (
  echo 📦 Instalando dependências...
  call npm install
  echo.
)

echo 🚀 Iniciando servidor...
echo.
echo Para acessar via Wi-Fi, use o endereço IP local:
echo Abra o terminal de outro PC e execute: ipconfig
echo Procure por IPv4 Address (ex: 192.168.1.100)
echo Depois acesse: http://192.168.1.100:3000
echo.
echo ═══════════════════════════════════════════════════════════════
echo.

node server.js

pause
