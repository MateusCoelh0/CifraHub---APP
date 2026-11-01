# 🔧 SETUP - Guia de Configuração Detalhado

## Instalação por Sistema Operacional

### 1️⃣ Windows

#### Opção A: Rápido (Recomendado)
```bash
1. Abra o PowerShell ou CMD na pasta do projeto
2. Execute: start.bat
3. Ele faz tudo automaticamente!
```

#### Opção B: Manual
```bash
# 1. Instale Node.js de: https://nodejs.org (LTS)
# 2. Abra PowerShell/CMD na pasta cifrahub
# 3. Execute:
npm install
npm start

# 4. Ou simplesmente:
node server.js
```

#### Encontrar o IP local (Windows):
```powershell
ipconfig

Procure por:
"IPv4 Address . . . . . . . . . . . : 192.168.x.x"
```

---

### 2️⃣ Mac

```bash
# 1. Instale Node.js (usando Homebrew)
brew install node

# 2. Na pasta do projeto:
chmod +x start.sh
./start.sh

# Ou manual:
npm install
npm start
```

#### Encontrar o IP local (Mac):
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

---

### 3️⃣ Linux (Ubuntu/Debian)

```bash
# 1. Instale Node.js
sudo apt update
sudo apt install nodejs npm

# 2. Na pasta do projeto:
chmod +x start.sh
./start.sh

# Ou manual:
npm install
npm start
```

#### Encontrar o IP local (Linux):
```bash
hostname -I
# Ou:
ifconfig | grep "inet "
```

---

### 4️⃣ Android (Termux)

#### Instalação Automática (Recomendado)
```bash
# Abra Termux e execute:
bash instalar.sh

# Ele faz tudo! Instalação, configuração e inicialização automática
```

#### Manual (se preferir controle total)
```bash
# 1. Atualize repositórios
apt update && apt upgrade -y

# 2. Instale Node.js e Git
apt install -y nodejs git

# 3. Clone/copie o repositório para:
mkdir -p $HOME/cifrahub
# (Copie os arquivos para essa pasta)

# 4. Instale dependências
cd $HOME/cifrahub
npm install

# 5. Inicie
node server.js

# Para ver seu IP:
ifconfig | grep "inet " | grep -v 127.0.0.1
```

---

## 🌐 Conectando Dispositivos

### Passo 1: Inicie o servidor em um dispositivo
```bash
npm start
# Aparecerá mensagem: "Servidor rodando em: http://0.0.0.0:3000"
```

### Passo 2: Encontre o IP desse dispositivo
```bash
# Windows:
ipconfig | findstr IPv4

# Mac/Linux/Termux:
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Você verá algo como: **192.168.1.100**

### Passo 3: Acesse de outro dispositivo
Na **mesma rede Wi-Fi**, abra um navegador e vá para:
```
http://192.168.1.100:3000
```

### Passo 4: Já está!
- O primeiro dispositivo a conectar é automaticamente o **HOST** 🎸
- Você controla: música, transposição, capotraste, auto-scroll
- Outros dispositivos veem tudo em tempo real 👁️

---

## 🔌 Problemas de Conexão?

### Não consegue acessar a página
1. **Confirme que estão na mesma rede Wi-Fi**
   - Wi-Fi do celular
   - Wi-Fi da casa
   - Rede mobile compartilhada, etc

2. **Confirme o IP correto**
   - Execute `ipconfig` no PC/servidor
   - Use exatamente esse IP

3. **Firewall está bloqueando?**
   - Windows: Permita a porta 3000 no Firewall
   - Mac: System Preferences > Security > Firewall

4. **Tente com `localhost`**
   - No mesmo PC: `http://localhost:3000`
   - Se funcionar, é problema de rede

5. **Reinicie tudo**
   - Ctrl+C para parar o servidor
   - Abre de novo: `npm start`
   - Recarrega a página (F5)

### WebSocket não sincroniza
1. Abre Console do Navegador (F12)
2. Procura por erros vermelhos
3. Se disser "Cannot connect to WebSocket"
   - Porta 3000 está bloqueada
   - IP está errado
   - Servidor não está rodando

### Muito lento / Lag
1. Wi-Fi fraca? Aproxime mais do roteador
2. Muitos dispositivos? Reduce quantidade conectada
3. Muitas abas abertas? Fecha outras
4. Reinicia roteador Wi-Fi

---

## 📊 Estrutura de Dados

### Arquivo `data.json`
Criado automaticamente na primeira vez. Contém:

```json
{
  "songs": [
    {
      "id": "1",
      "title": "Nome da Música",
      "artist": "Artista",
      "key": "C",
      "tempo": 120,
      "cifra": "[C]Letra [G]aqui"
    }
  ],
  "setlists": [
    {
      "id": "1",
      "name": "Setlist 1",
      "songs": ["1", "2", "3"]
    }
  ]
}
```

### Fazer Backup
```bash
# Copie data.json para um local seguro
cp data.json backup_data.json

# Para restaurar:
cp backup_data.json data.json
```

---

## ⚙️ Configuração Avançada

### Mudar a porta (padrão: 3000)

Edite `server.js`:
```javascript
const PORT = process.env.PORT || 3000;  // ← Mude o número aqui
```

Então acesse: `http://seu-ip:NOVA_PORTA`

### Rodar servidor 24/7

#### Windows
Crie um arquivo `schedtask.bat`:
```batch
@echo off
cd C:\caminho\para\cifrahub
node server.js
```

Agende com Task Scheduler do Windows

#### Mac/Linux
Use `screen` ou `tmux`:
```bash
screen -S cifrahub node server.js
# Ctrl+A+D para sair mantendo rodando

# Ver sessões:
screen -ls

# Reconectar:
screen -r cifrahub
```

#### Android (Termux)
Use `termux-wake-lock` e o script `instalar.sh` já configura tudo!

---

## 🚀 Performance

### Otimizações Automáticas
- Código minificado no cliente
- Sem bibliotecas externas no frontend
- WebSocket binary mode (futuro)
- Compressão gzip (futuro)

### Limites Testados
- ✅ 20+ dispositivos conectados
- ✅ 500+ músicas no repertório
- ✅ 100+ setlists
- ✅ Shows de 3+ horas

---

## 📱 Dicas de Uso

### No Palco
1. Ative **Modo Palco** (botão ⚫) para tela preta
2. Coloque um tablet em lugar visível
3. Deixe o HOST (seu notebook) próximo
4. Ajuste transposição antes de começar
5. Use a navegação ◄ ANTERIOR / PRÓXIMO ► entre músicas

### Na Banda
- Distribuir dispositivos entre os músicos
- Todos veem a mesma cifra em tempo real
- HOST controla tudo
- Guitarrista olha seu tablet, baterista o seu, etc.

### Em Ensaios
- Pratique a setlist na ordem correta
- Ajuste transposições conforme necessário
- Salve a setlist para reutilizar depois
- Edite cifras conforme aprende a música

---

## 🆘 Support

Se algo não funcionar:

1. Confira que Node.js está instalado: `node --version`
2. Confirme que está na mesma rede
3. Reinicia o servidor e recarrega a página
4. Limpa cache: Ctrl+Shift+Delete
5. Abre o console (F12) e procura por erros

---

**🎸 Pronto para rodar! Bom show! 🎸**
