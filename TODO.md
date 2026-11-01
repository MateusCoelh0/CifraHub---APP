# TODO - Novas Features CifraHub

## 📂 1. Filtro de Músicas por Setlist
- [ ] `renderSongs()` filtra músicas quando `currentSetlist` está ativa
- [ ] Botão "📚 Ver Todas" para limpar filtro (deselect setlist)
- [ ] Botão "+" dentro da setlist aberta (abre submodal com lista de músicas disponíveis)
- [ ] Botão "✕" em cada música da setlist (remove da setlist, sem apagar)
- [ ] Título da seção muda para nome da setlist quando filtrada

## 🎼 2. Importação .TXT
- [ ] Botão "📁 IMPORTAR .TXT" no modal "Nova Música"
- [ ] Função `parseTxtCifra(text)` detecta acordes acima da letra e converte para `[C]letra`
- [ ] Suporta também formato com colchetes já presentes

## 🎤 3. Modo Cantor (local)
- [ ] Botão "🎤 CANTOR" acessível a todos
- [ ] `appState.singerMode` + localStorage
- [ ] `renderCifra()` remove acordes se singerMode
- [ ] Slider "Tamanho da fonte" para modo cantor E modo normal
- [ ] Fontes configuráveis persistidas por dispositivo

## 🎚️ 4. Permissões
- [x] Qualquer usuário: tema, viewer mode
- [x] Apenas HOST: selectSong, selectSetlist, transpose, capo, modos, edição
- [ ] Garantir que `toggleSingerMode()` é local (qualquer pessoa)
- [ ] Toasts de aviso para não-hosts

## 🌗 5. Tema Escuro
- [x] Alternância manual + auto do sistema (já implementado)
- [ ] Melhorar contraste de acordes no modo palco

## 🔧 Backend
- [ ] Handler `deleteSong` em server.js (remove música + remove de todas setlists)

## ✅ Testes
- [ ] Testar parser de .txt com vários formatos
- [ ] Testar filtro setlist + adicionar/remover músicas
- [ ] Testar modo cantor + ajuste de fonte
