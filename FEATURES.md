# 🎸 Funcionalidades Detalhadas - CifraHub

## 📋 Índice de Funcionalidades

1. [Sincronização em Tempo Real](#sincronização-em-tempo-real)
2. [Sistema HOST/CLIENT](#sistema-hostclient)
3. [Repertório de Músicas](#repertório-de-músicas)
4. [Transposição Cromática](#transposição-cromática)
5. [Capotraste](#capotraste)
6. [Auto-Scroll](#auto-scroll)
7. [Setlists](#setlists)
8. [Modo Palco](#modo-palco)
9. [Gerenciamento de Dados](#gerenciamento-de-dados)
10. [Interface e Design](#interface-e-design)

---

## 🌐 Sincronização em Tempo Real

**Como funciona:**
- Usa WebSocket para comunicação bidirecional
- Latência ultra-baixa (<100ms típico)
- Todos os dispositivos sincronizados instantaneamente
- Funciona 100% offline em rede local

**O que sincroniza:**
- ✅ Seleção de música
- ✅ Transposição
- ✅ Capotraste
- ✅ Velocidade de auto-scroll
- ✅ Posição de scroll
- ✅ Modo palco
- ✅ Lista de setlists
- ✅ Repertório de músicas

**Eventos sincronizados:**
```javascript
// Exemplo de fluxo
HOST muda música → Servidor recebe → Broadcast para TODOS
VIEWER vê música mudar em tempo real (sincronizado)
```

---

## 👑 Sistema HOST/CLIENT

### Arquitetura

```
         SERVIDOR
            ↑↓
    (WebSocket Bridge)
         ↙  ↓  ↘
       HOST  CL1  CL2
    (Controla) (Visualiza)
```

### Primeiro Dispositivo = HOST 🎸
- Autoelevado a HOST automaticamente
- Tem controle total de:
  - Qual música está tocando
  - Transposição de acordes
  - Capotraste
  - Velocidade de auto-scroll
  - Criação/edição de músicas
  - Gerenciamento de setlists

**Indicador:** Badge dourado "🎸 HOST"

### Segundo+ Dispositivos = VISUALIZADORES 👁️
- Veem tudo em tempo real
- NÃO podem editar ou controlar
- Sincronizam com HOST automaticamente
- Perfeito para banda acompanhando

**Indicador:** Badge verde "👁️ VISUALIZADOR"

### Mudança de HOST

**Se o HOST desconectar:**
1. Servidor detecta desconexão
2. Próximo dispositivo conectado vira novo HOST
3. Aviso automático: "🎸 Você é o novo HOST!"
4. ZERO perda de dados

**Importante:**
- Apenas o HOST pode fazer alterações
- Visualizadores podem recarregar a página sem problemas
- Trocar de HOST é instantâneo

---

## 🎵 Repertório de Músicas

### Adicionar Música (+)
**Apenas HOST pode fazer isso**

Formulário com campos:
- **Título** (obrigatório) - Ex: "Imagine"
- **Artista** (opcional) - Ex: "John Lennon"
- **Tom Original** (dropdown) - 24 opções:
  - Maiores: C, C#, D, D#, E, F, F#, G, G#, A, A#, B
  - Menores: Cm, C#m, Dm, D#m, Em, Fm, F#m, Gm, G#m, Am, A#m, Bm
- **Andamento BPM** (opcional) - Ex: 120
- **Cifra** (obrigatório) - Texto com formato [ACORDE]

### Editar Música (✎️)
- Apenas HOST pode editar música atual
- Botão "✎️ EDITAR MÚSICA" abre formulário preenchido
- Todas as mudanças sincronizam para todos

### Deletar Música
Atualmente: Remova do arquivo data.json manualmente
(Futuro: implementar botão de deletar)

### Buscar Música
Lista interativa na sidebar esquerda mostra:
- Título em verde neon (primário)
- Artista em âmbar (destaque)
- Clique para selecionar
- Destaque automático da música atual

---

## 🎹 Transposição Cromática

### O que é
Ajusta TODOS os acordes de uma música cromática (semitom por semitom)

### Como usar
1. **Slider** (na direita)
   - Range: -12 a +12 semitons
   - Arraste para transpor
   - Atualiza em tempo real

2. **Botões Rápidos**
   - `-1` : reduz um semitom
   - `0` : volta ao tom original
   - `+1` : aumenta um semitom

### Exemplos
```
Tom original: C (dó)
Transposição: +2 → Passa para D (ré)
Transposição: -3 → Passa para A (lá)
Transposição: -5 → Passa para G (sol)
```

### Suporte a Acordes
✅ Simples: C, D, E, F, G, A, B
✅ Menores: Cm, Dm, Em, etc
✅ Sustenidos: C#, D#, F#, G#, A#
✅ Bemóis: Db, Eb, Gb, Ab, Bb
✅ Estendidos: Cmaj7, Dm9, G7, Am7, Dsus2, Cadd9
✅ Com baixo: C/E, G/B, Am/F

### Sincronização
- HOST ajusta transposição
- Todos veem mudança INSTANTÂNEA
- Útil para:
  - Ajustar tom para cantor
  - Diferentes tonalidades na banda
  - Musicais com múltiplas chaves

---

## 🎸 Capotraste

### O que é
Define em qual traste colocar o capotraste (1-12 trastes)

### Como ajustar
1. **Slider** na seção "🎸 CAPOTRASTE"
   - Range: 0 a 12 trastes
   - 0 = sem capotraste
   - Atualiza em tempo real

### Diferença: Capo vs Transposição

| Aspecto | Capotraste | Transposição |
|---------|-----------|--------------|
| Como funciona | Fisicamente no instrumento | Apenas na visualização |
| Afeta som | SIM | Não |
| Na cifra | Não muda acordes | Muda para novo tom |
| Uso | Adaptar tom do cantor | Acompanhar banda |
| Exemplo | [Capo 2] F = D | F transposto -2 = D |

### Uso Prático
```
Música: Tom original = C
HOST: "Cantor canta em D, vou usar capo 2"
Todos: Veem cifra em C, colocam capo 2, soam em D
```

---

## 📜 Auto-Scroll

### O que faz
Rola automaticamente a cifra enquanto você toca

### Como ativar
1. **Slider** "📜 AUTO-SCROLL"
   - Range: 0 a 100 (velocidade)
   - 0 = desativado
   - Atualiza em tempo real

### Velocidades Recomendadas
- **Lenta** (10-20): Para baladas
- **Normal** (30-50): Para maioria das músicas
- **Rápida** (60-80): Para músicas rápidas
- **Muito Rápida** (80+): Para rock/metal

### Como funciona
- Smooth scroll (não salta)
- Usa scroll incremental
- Para quando voltar para cima (anti-scroll acidental)

### Casos de uso
- Live solo
- Palestra/aula de música
- Leitura enquanto toca
- Ensaio visual

---

## 📋 Setlists

### O que é
Coleção ordenada de músicas para um show

### Criar Setlist
1. Clique em "+ NOVA SETLIST" (na sidebar)
2. Digite nome: "Show SP - 30/04/2024"
3. Selecione músicas (checkboxes)
4. Clique em "CRIAR"
5. Sincroniza para todos

### Usar Setlist
1. Clique na setlist na sidebar esquerda
2. Primeira música já carrega
3. Use botões de navegação:
   - ◄ ANTERIOR: volta para música anterior
   - PRÓXIMO ►: avança para próxima música

### Recursos da Setlist
- Pode ter quantas músicas quiser
- Pode reordenar manualmente (futuro)
- Ao mudar de música, transposição zera
- Perfeito para plannear shows

### Eliminar Setlist
Botão "REMOVER" embaixo de cada setlist
(Apenas HOST pode remover)

### Exemplo
```
Setlist: "Show no Bar"
├─ 1. Imagine (John Lennon)
├─ 2. Wonderwall (Oasis)
├─ 3. Hallelujah (Leonard Cohen)
├─ 4. Someone Like You (Adele)
└─ 5. Stairway to Heaven (Led Zeppelin)

Navigation:
[◄ ANTERIOR] Imagine > Wonderwall > Hallelujah [PRÓXIMO ►]
```

---

## ⚫ Modo Palco

### O que é
Tela preta com APENAS a cifra em foco total

### Como ativar
Botão "⚫ PALCO" no topo direito

### O que desaparece
- ❌ Sidebar esquerda (repertório)
- ❌ Painel direita (controles)
- ❌ Header com informações
- ✅ Apenas cifra em fundo preto

### O que continua funcionando
- ✅ Todas as sincronizações WebSocket
- ✅ Scroll (automático ou manual)
- ✅ Transposição (se HOST ajustar)
- ✅ Auto-scroll

### Sair do Modo Palco
- Clique no botão "⚫ PALCO" novamente
- Ou recarregue (F5)
- Interface volta ao normal

### Caso de uso
```
Palco:
- Tablet grande em cima do instrumentista
- Fundo PRETO = sem luz de fundo
- Fonte monospace = super legível
- Neon verde = visível mesmo com luzes do palco
- ZERO distrações
```

---

## 💾 Gerenciamento de Dados

### Armazenamento
- **Servidor**: Arquivo `data.json` na pasta do projeto
- **Cliente**: LocalStorage do navegador (preferências)

### Dados Persistidos (data.json)
```json
{
  "songs": [...],      // Repertório completo
  "setlists": [...]    // Todas as setlists
}
```

### Dados Locais (LocalStorage)
- Nome do dispositivo
- Modo palco ativado/desativado

### Sincronização
- Quando uma música é adicionada/editada → todos recebem
- Quando uma setlist é criada → todos recebem
- Data.json atualiza automaticamente

### Backup
```bash
# Copiar arquivo de dados
cp data.json backup_data.json

# Restaurar
cp backup_data.json data.json
```

### Importar Músicas Customizadas
Edite `data.json` manualmente ou use a interface

---

## 🎨 Interface e Design

### Tema Visual

| Elemento | Cor | Uso |
|----------|-----|-----|
| Primário | #00ff41 (Verde Neon) | Bordas, texto importante, controles ativos |
| Destaque | #ffa500 (Âmbar) | Headers, ênfase secundária |
| Fundo | #0a0e27 (Preto Profundo) | Background principal |
| Mais Escuro | #050710 (Preto Absoluto) | Backgrounds secundários |
| Texto | #e0e0e0 (Cinza) | Texto principal |
| Borda | #1a2540 (Azul Escuro) | Separadores |

### Tipografia
**Font:** Courier New (monospace)
- Perfeita para cifras
- Monoespaciada = alinhamento exato
- Industrial = tema de show

### Layout Responsivo
```
Desktop (1200px+):
│ Sidebar │ Main Content │ Control Panel │
   280px       1fr            320px

Tablet (768-1200px):
│ Main Content │ Control Panel │
      1fr           250px

Celular (<768px):
│ Main Content │
      1fr
(Sidebar e controles em modal)
```

### Elementos Visuais

**Badges:**
- 🎸 HOST (Âmbar) - Você controla
- 👁️ VISUALIZADOR (Verde) - Você vê

**Indicadores:**
- Status de conexão: ● (Verde = Online)
- Contador de clientes: número em tempo real
- Rol do dispositivo: HOST ou VIEWER

**Transições:**
- Smooth hover (200ms)
- Glow effects nos botões
- Box shadows nas cores primárias

### Cores dos Acordes
- Acordes: **Verde neon** (#00ff41)
- Resto do texto: **Cinza** (#e0e0e0)
- Fundo: **Preto profundo** (#0a0e27)

---

## 🔮 Funcionalidades Futuras

- [ ] Reordenar músicas na setlist (drag-drop)
- [ ] Importar cifras de bases externas
- [ ] Exportar setlist em PDF
- [ ] Histórico de transposição
- [ ] Metrônomo integrado
- [ ] Modo Dueto (2 cifras lado a lado)
- [ ] Acordes cifrados (C7/G)
- [ ] Sync de áudio (metronôme)
- [ ] PWA (instalar na tela inicial)
- [ ] Modo offline com sincronização posterior

---

**🎸 CifraHub - Levando suas cifras para o palco! 🎸**
