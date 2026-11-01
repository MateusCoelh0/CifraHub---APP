#!/bin/bash

# ╔════════════════════════════════════════════════════════════╗
# ║   CIFRAHUB - Script de Inicialização (Mac/Linux)           ║
# ╚════════════════════════════════════════════════════════════╝

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║    🎸 CIFRAHUB - Show ao Vivo 🎸                          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js não encontrado!${NC}"
  echo "Instale em: https://nodejs.org"
  exit 1
fi

echo -e "${GREEN}✓ Node.js detectado: $(node --version)${NC}"
echo ""

# Verificar se node_modules existe
if [ ! -d "node_modules" ]; then
  echo -e "${BLUE}📦 Instalando dependências...${NC}"
  npm install
  echo ""
fi

echo -e "${BLUE}🚀 Iniciando servidor...${NC}"
echo ""
echo "Para acessar via Wi-Fi, use o endereço IP local:"
echo "Abra outro terminal e execute: ifconfig"
echo "Procure por algo como: inet 192.168.x.x ou 10.0.x.x"
echo "Depois acesse: http://192.168.x.x:3000"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

node server.js
