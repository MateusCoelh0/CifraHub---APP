# 🎸 CifraHub - App de Cifras para Shows ao Vivo

Um app web moderno para sincronizar cifras de músicas entre múltiplos dispositivos em tempo real via WebSocket. Perfeito para shows ao vivo, ensaios e apresentações!

## ⚡ Características

✅ **Sincronização em Tempo Real** via WebSocket
✅ **Múltiplas bandas e sessões** - Repertórios isolados por equipe
✅ **Acesso seguro** - Conta para a banda e entrada de convidado por código
✅ **Transposição Cromática** - Suporte a sustenidos e bemóis
✅ **Capotraste** - Ajuste de traste em tempo real
✅ **Auto-Scroll** - Rolagem automática configurável
✅ **Modo Foco** - Oculta barras para destacar a cifra
✅ **Repertório Ilimitado** - Criação e edição de cifras
✅ **Setlists** - Organize músicas para o show
✅ **Interface clara e dourada** - Vidro fosco e controles táteis para o palco
✅ **Sem Framework** - HTML/CSS/JavaScript puro
✅ **Funciona Offline** - Roda em rede local sem internet

## 🚀 Instalação Rápida

### Pré-requisitos

- Node.js v20+ instalado
- Conexão Wi-Fi ou rede local

### Windows (PowerShell)

```bash
# 1. Clone ou extraia o repositório
cd cifrahub

# 2. Instale as dependências
npm install

# 3. Se ainda não existir, crie o .env a partir do modelo
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
#    Configure DATABASE_URL, JWT_SECRET forte e LEGACY_OWNER_EMAIL.
#    Para a primeira configuração, aplique migrations/001_initial_multi_tenant.sql.
```

### macOS / Linux

```bash
# 1. Clone ou extraia o repositório
cd cifrahub

# 2. Instale as dependências
npm install

# 3. Se ainda não existir, crie o .env a partir do modelo
if [ ! -f .env ]; then cp .env.example .env; fi
#    Configure DATABASE_URL, JWT_SECRET forte e LEGACY_OWNER_EMAIL.
#    Para a primeira configuração, aplique migrations/001_initial_multi_tenant.sql.
```

### Aplicar a migração e iniciar (todas as plataformas)

```bash
# 4. Aplique a migração dos códigos de sessão e compile
npm run db:migrate-session-codes
npm run build

# 5. Inicie o servidor TypeScript
npm start
```

O servidor rodará em `http://localhost:3000`

O `.env.example` é apenas um modelo: substitua os valores de exemplo antes de iniciar. A conta precisa estar cadastrada no PostgreSQL; para definir a senha do administrador legado, use `npm run db:set-owner-password`.

### Estrutura da interface

- `public/index.html` entrega a interface autenticada e compatível com convidados.
- `public/css/` reúne o tema claro/dourado, componentes e estilo de palco.
- `public/js/` contém clientes da API, autenticação, contexto de bandas, WebSocket e gestos móveis.
- `/?code=123456` abre a tela de acesso convidado com o código da sessão preenchido.

## Publicar na internet (Render)

O projeto inclui `render.yaml` para publicar o servidor Node.js com WebSocket no Render. O serviço usa HTTPS/WSS e o plano gratuito, adequado para testes.

1. Envie este projeto para um repositório Git no GitHub ou GitLab. Inclua `package-lock.json` para que `npm ci` funcione no deploy.
2. No Render, escolha **New > Blueprint** e conecte o repositório.
3. O Render vai ler `render.yaml`; confirme a criação do serviço `cifrahub` no plano **Free**.
4. Ao terminar, abra a URL `https://...onrender.com` fornecida pelo Render.

O serviço de hospedagem precisa de um PostgreSQL acessível e das variáveis `DATABASE_URL`, `JWT_SECRET`, `LEGACY_OWNER_EMAIL` e `CORS_ORIGIN`. Configure-as no painel do provedor antes de iniciar o servidor.

### Android (Termux)

```bash
# 1. Abra o Termux
# 2. Execute o script de instalação
bash instalar.sh

# 3. Siga as instruções na tela
```

## 📱 Como Usar

### No servidor (um dispositivo qualquer):

```bash
cd cifrahub
npm run build
npm start
```

Você verá algo como:

```
╔════════════════════════════════════════════╗
║    🎸 CIFRAHUB - Show ao Vivo 🎸          ║
╚════════════════════════════════════════════╝

Servidor rodando em: http://0.0.0.0:3000
```

### Encontre seu IP local:

**Windows:**

```powershell
ipconfig
```

Procure por "IPv4 Address" (algo como 192.168.1.100)

**Mac/Linux/Termux:**

```bash
ifconfig
```

Procure por algo como: 192.168.x.x ou 10.0.x.x

### Acesse de outro dispositivo:

- Na mesma rede Wi-Fi ou LAN
- Abra: `http://<SEU_IP>:3000` (ex: http://192.168.1.100:3000)

## 🎮 Funcionamento

### 1️⃣ Integrante autorizado = HOST 🎸

- Controla qual música está tocando
- Ajusta transposição de acordes
- Define capotraste
- Controla auto-scroll
- Gerencia repertório e setlists

### 2️⃣ Convidados = VISUALIZADORES 👁️

- Veem tudo em tempo real
- Seguem todas as alterações do HOST
- Entram com código de seis dígitos e apelido, sem criar conta

### 3️⃣ Se o HOST Desconectar

- O próximo dispositivo conectado vira novo HOST automaticamente
- Sem perda de dados

## 🎵 Recursos Principais

### Repertório

- ➕ Criar novas músicas
- ✎️ Editar cifras existentes
- 🎵 Incluir: título, artista, tom, BPM, cifra

### Cifras

- Use formato: `[ACORDE]` para acordes
- Ex: `[C]Letra aqui [G]mais letras`
- Acordes destacados em dourado sobre fundo claro

### Transposição

- Deslize para transpor em semitons (-12 a +12)
- Botões rápidos: -1, 0, +1
- Suporta sustenidos (#) e bemóis (b)

### Capotraste

- Ajuste de 0 a 12 trastes
- Afeta visualização dos acordes
- Sincronizado entre todos

### Auto-Scroll

- Velocidade configurável (0-100)
- Perfeito para ler enquanto toca
- Ativa/desativa em tempo real

### Setlists

- Organize músicas por ordem
- Navegue entre músicas com os botões ◄ ANTERIOR / PRÓXIMO ►
- Transposição zera ao mudar de música
- Perfeito para planejar o setlist antes do show

### Modo Foco

- Oculta as barras e deixa a cifra em destaque
- Mantém a identidade clara e dourada
- A barra móvel oferece transposição, auto-scroll e acesso ao repertório
- Um toque em “Mostrar controles” restaura a interface

## 🎨 Design

| Elemento   | Cor              | Código   |
| ---------- | ---------------- | -------- |
| Elemento   | Cor              | Código   |
| ---------- | -----            | -------- |
| Primário   | Dourado elegante | #c89b3c  |
| Destaque   | Dourado claro    | #d4af37  |
| Fundo      | Branco gelo      | #f5f5f7  |
| Texto      | Cinza escuro     | #1d1d1f  |

Tipografia: **Courier New** (monospace) - perfeita para cifras!

## 📝 Formato de Cifra

```
[C]Verso primeiro
[F]Com acordes antes
[G]De cada linha

[C]Refrão
[Am]Aqui em baixo
[F]Da música

[C]Segunda estrofe
[G]Siga o padrão
```

## 🔧 Estrutura de Arquivos

```
cifrahub/
├── server.js          # Servidor Node.js + WebSocket
├── index.html         # App completo (interface + JS)
├── package.json       # Dependências
├── data.json          # Base de dados (criada automaticamente)
├── instalar.sh        # Script para Termux
└── README.md          # Este arquivo
```

## 🌐 Requisitos de Rede

- **Mesma rede Wi-Fi**: Todos os dispositivos na mesma rede
- **Sem internet necessário**: Funciona 100% offline
- **Porta**: 3000 (pode mudar em server.js)

### Firewall

Se a conexão não funcionar, permita a porta 3000:

**Windows:**

```powershell
netsh advfirewall firewall add rule name="CifraHub" dir=in action=allow protocol=tcp localport=3000
```

**Mac:**
Vá em: System Preferences > Security & Privacy > Firewall

## 🚨 Troubleshooting

### Não consegue conectar?

1. Confirme que estão na mesma rede Wi-Fi
2. Desligue VPN/proxy no celular
3. Verifique firewall do PC
4. Tente `http://<IP>:3000` (sem HTTPS)
5. Reinicie o servidor: `npm start`

### App não sincroniza?

1. Abra o console (F12) e procure por erros
2. Verifique se o servidor está rodando
3. Confirme o endereço IP está correto
4. Tente recarregar a página (F5)

### Slow/Lag?

1. Reduz número de dispositivos conectados
2. Fecha outras abas pesadas no navegador
3. Verifica qualidade da rede Wi-Fi
4. Reinicia o roteador

## 📦 Dependências

```json
{
  "express": "^4.18.2", // Servidor HTTP
  "ws": "^8.13.0" // WebSocket
}
```

Tudo mais é JavaScript puro! Nenhum framework pesado.

## 🎯 Roadmap (Futuro)

- [ ] Suporte a PDF de cifras
- [ ] Histórico de transposição
- [ ] Sincronização de scroll mais suave
- [ ] App PWA para instalar na tela inicial
- [ ] Exportar setlist em PDF
- [ ] Importar cifras de bases de dados externas
- [ ] Suporte a acordes cifrados (C7/G, etc)
- [ ] Dark mode ainda mais escuro 😎

## 📄 Licença

MIT - Use livremente!

## 🎸 Créditos

Desenvolvido para músicos e bandas que querem sincronizar cifras em shows ao vivo.

---

**🎸 Bom show! 🎸**

Para dúvidas ou sugestões, abra uma issue no GitHub.
