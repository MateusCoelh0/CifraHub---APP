#!/bin/bash

# ╔════════════════════════════════════════════════════════════╗
# ║   CIFRAHUB - Script de Instalação para Termux (Android)   ║
# ╚════════════════════════════════════════════════════════════╝

echo "🎸 Bem-vindo ao CifraHub - Cifras para Shows ao Vivo"
echo "══════════════════════════════════════════════════════════"
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Verificar se é Termux
if [ ! -d "$PREFIX" ]; then
  echo -e "${RED}❌ Este script deve rodar no Termux${NC}"
  exit 1
fi

echo -e "${BLUE}📦 Atualizando repositórios...${NC}"
apt update && apt upgrade -y

echo -e "${BLUE}📦 Instalando Node.js...${NC}"
apt install -y nodejs

echo -e "${BLUE}📦 Instalando Git...${NC}"
apt install -y git

# Verificar instalação
echo -e "${YELLOW}✓ Versões instaladas:${NC}"
node --version
npm --version

echo ""
echo -e "${BLUE}📂 Criando diretório do CifraHub...${NC}"
CIFRAHUB_DIR="$HOME/cifrahub"

if [ -d "$CIFRAHUB_DIR" ]; then
  echo -e "${YELLOW}⚠️  Diretório já existe. Usando o existente...${NC}"
else
  mkdir -p "$CIFRAHUB_DIR"
  echo -e "${GREEN}✅ Diretório criado: $CIFRAHUB_DIR${NC}"
fi

cd "$CIFRAHUB_DIR"

echo ""
echo -e "${BLUE}📦 Instalando dependências Node.js...${NC}"
npm install express ws

echo ""
echo -e "${BLUE}📝 Criando arquivo de inicialização automática...${NC}"

# Criar script de inicialização
cat > "$CIFRAHUB_DIR/start.sh" << 'EOFSTART'
#!/bin/bash
cd $(dirname "$0")
echo "🎸 Iniciando CifraHub..."
node server.js
EOFSTART

chmod +x "$CIFRAHUB_DIR/start.sh"

# Criar arquivo .profile para iniciar automaticamente
echo ""
echo -e "${YELLOW}Deseja iniciar o CifraHub automaticamente quando abrir o Termux? (s/n)${NC}"
read -p "Resposta: " auto_start

if [ "$auto_start" = "s" ] || [ "$auto_start" = "S" ]; then
  echo "" >> ~/.bashrc
  echo "# CifraHub Auto-start" >> ~/.bashrc
  echo "if [ -f '$CIFRAHUB_DIR/start.sh' ]; then" >> ~/.bashrc
  echo "  '$CIFRAHUB_DIR/start.sh'" >> ~/.bashrc
  echo "fi" >> ~/.bashrc
  echo -e "${GREEN}✅ Inicialização automática configurada${NC}"
else
  echo -e "${YELLOW}⚠️  Para iniciar manualmente execute:${NC}"
  echo -e "${BLUE}cd $CIFRAHUB_DIR && node server.js${NC}"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║            ✅ INSTALAÇÃO CONCLUÍDA COM SUCESSO             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}📋 Próximos passos:${NC}"
echo ""
echo "1️⃣  Inicie o servidor:"
echo -e "   ${BLUE}cd $CIFRAHUB_DIR${NC}"
echo -e "   ${BLUE}node server.js${NC}"
echo ""
echo "2️⃣  Em outro dispositivo na mesma rede Wi-Fi:"
echo -e "   ${BLUE}http://<IP_DO_ANDROID>:3000${NC}"
echo ""
echo "3️⃣  Para encontrar seu IP local:"
echo -e "   ${BLUE}ifconfig${NC}"
echo "   Procure por algo como: 192.168.x.x ou 10.0.x.x"
echo ""
echo -e "${YELLOW}💡 Dica: O primeiro dispositivo a conectar vira HOST (controla o show)${NC}"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "🎸 Bom show! 🎸"
echo "═══════════════════════════════════════════════════════════"
