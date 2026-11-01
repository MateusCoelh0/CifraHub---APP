import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Configuração
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || join(__dirname, 'data.json');

// Estado da aplicação
let appState = {
  currentSong: null,
  currentSongIndex: null,
  currentSetlist: null,
  transpose: 0,
  capotraste: 0,
  autoScrollSpeed: 0,
  isAutoScrolling: false,
  scrollPosition: 0,
  stageMode: false,
  songs: [],
  setlists: []
};

let hostClient = null;
const connectedClients = new Map();

// Carregar dados persistidos
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      appState.songs = data.songs || [];
      appState.setlists = data.setlists || [];
    }
  } catch (err) {
    console.log('Criando banco de dados novo...');
    appState.songs = getSampleSongs();
    appState.setlists = [];
    saveData();
  }
  if (appState.songs.length === 0) {
    appState.songs = getSampleSongs();
  }
}

// Salvar dados
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    songs: appState.songs,
    setlists: appState.setlists
  }, null, 2));
}

// Músicas de exemplo
function getSampleSongs() {
  return [
    {
      id: '1',
      title: 'Imagine',
      artist: 'John Lennon',
      key: 'C',
      tempo: 76,
      cifra: `[C]Imagine all the people\n[F]Living life in peace\n[C]You, you may say\n[G]I'm a dreamer\n[C]But I'm not the only one`
    },
    {
      id: '2',
      title: 'Hotel California',
      artist: 'Eagles',
      key: 'Bm',
      tempo: 76,
      cifra: `[Bm]On a dark desert highway\n[F#]Cool wind in my hair\n[A]Warm smell of colitas\n[E]Rising up through the air\n[Bm]Up ahead in the distance\n[F#]I saw a shimmering light`
    },
    {
      id: '3',
      title: 'Wonderwall',
      artist: 'Oasis',
      key: 'Em7',
      tempo: 87,
      cifra: `[Em7]Today is gonna be the day\n[Dsus2]That they're gonna throw it back to you\n[Cadd9]By now you should've somehow\n[Dsus2]Realized what you gotta do\n[Em7]I don't believe that anybody\n[Dsus2]Feels the way I do about you now`
    }
  ];
}

// Broadcast para todos os clientes
function broadcast(message) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(JSON.stringify(message));
    }
  });
}

// Rota para servir o HTML
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// WebSocket
wss.on('connection', (ws) => {
  const clientId = Date.now() + Math.random().toString(36);
  connectedClients.set(clientId, {
    id: clientId,
    isHost: false,
    ws: ws,
    deviceName: 'Dispositivo'
  });

  // Se não há host, este cliente vira host
  if (!hostClient) {
    hostClient = connectedClients.get(clientId);
    connectedClients.get(clientId).isHost = true;
    console.log(`🎸 HOST conectado: ${clientId}`);
  } else {
    console.log(`👁️ Visualizador conectado: ${clientId}`);
  }

  // Enviar estado atual ao novo cliente
  ws.send(JSON.stringify({
    type: 'init',
    state: appState,
    clientId: clientId,
    isHost: connectedClients.get(clientId).isHost,
    clientsCount: connectedClients.size
  }));

  // Notificar todos sobre novo cliente
  broadcast({
    type: 'clientsUpdate',
    clientsCount: connectedClients.size
  });

  // Receber mensagens
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      const sender = connectedClients.get(clientId);

      switch (message.type) {
        case 'setDeviceName':
          if (sender) sender.deviceName = message.name;
          broadcast({
            type: 'clientsUpdate',
            clientsCount: connectedClients.size
          });
          break;

        case 'selectSong':
          if (sender.isHost) {
            appState.currentSong = message.song;
            appState.currentSongIndex = message.index;
            appState.transpose = 0;
            appState.scrollPosition = 0;
            appState.isAutoScrolling = false;
            broadcast({
              type: 'songSelected',
              song: message.song,
              index: message.index
            });
          }
          break;

        case 'selectSetlist':
          if (sender.isHost) {
            appState.currentSetlist = message.setlist;
            appState.currentSongIndex = 0;
            if (message.setlist.songs.length > 0) {
              appState.currentSong = appState.songs.find(s => s.id === message.setlist.songs[0]);
              appState.transpose = 0;
            }
            broadcast({
              type: 'setlistSelected',
              setlist: message.setlist
            });
          }
          break;

        case 'transpose':
          if (sender.isHost) {
            appState.transpose = message.value;
            broadcast({
              type: 'transposeUpdated',
              transpose: message.value
            });
          }
          break;

        case 'capotraste':
          if (sender.isHost) {
            appState.capotraste = message.value;
            broadcast({
              type: 'capotrasteUpdated',
              capotraste: message.value
            });
          }
          break;

        case 'autoScroll':
          if (sender.isHost) {
            appState.autoScrollSpeed = message.speed;
            appState.isAutoScrolling = message.speed > 0;
            broadcast({
              type: 'autoScrollUpdated',
              speed: message.speed,
              isActive: message.speed > 0
            });
          }
          break;

        case 'scroll':
          if (sender.isHost) {
            appState.scrollPosition = message.position;
            broadcast({
              type: 'scrollUpdated',
              position: message.position
            });
          }
          break;

        case 'stageMode':
          if (sender.isHost) {
            appState.stageMode = message.enabled;
            broadcast({
              type: 'stageModeUpdated',
              enabled: message.enabled
            });
          }
          break;

        case 'nextSong':
          if (sender.isHost && appState.currentSetlist) {
            const songs = appState.currentSetlist.songs;
            if (appState.currentSongIndex < songs.length - 1) {
              appState.currentSongIndex++;
              appState.currentSong = appState.songs.find(s => s.id === songs[appState.currentSongIndex]);
              appState.transpose = 0;
              appState.scrollPosition = 0;
              broadcast({
                type: 'songSelected',
                song: appState.currentSong,
                index: appState.currentSongIndex
              });
            }
          }
          break;

        case 'previousSong':
          if (sender.isHost && appState.currentSetlist) {
            if (appState.currentSongIndex > 0) {
              appState.currentSongIndex--;
              appState.currentSong = appState.songs.find(s => s.id === appState.currentSetlist.songs[appState.currentSongIndex]);
              appState.transpose = 0;
              appState.scrollPosition = 0;
              broadcast({
                type: 'songSelected',
                song: appState.currentSong,
                index: appState.currentSongIndex
              });
            }
          }
          break;

        case 'addSong':
          if (sender.isHost) {
            const newSong = {
              id: Date.now().toString(),
              title: message.title || 'Nova Música',
              artist: message.artist || 'Artista',
              key: message.key || 'C',
              tempo: message.tempo || 120,
              cifra: message.cifra || '[C]Cifra aqui...'
            };
            appState.songs.push(newSong);
            saveData();
            broadcast({
              type: 'songAdded',
              song: newSong
            });
          }
          break;

        case 'updateSong':
          if (sender.isHost) {
            const idx = appState.songs.findIndex(s => s.id === message.song.id);
            if (idx !== -1) {
              appState.songs[idx] = message.song;
              saveData();
              if (appState.currentSong && appState.currentSong.id === message.song.id) {
                appState.currentSong = message.song;
              }
              broadcast({
                type: 'songUpdated',
                song: message.song
              });
            }
          }
          break;

        case 'createSetlist':
          if (sender.isHost) {
            const newSetlist = {
              id: Date.now().toString(),
              name: message.name || 'Nova Setlist',
              songs: message.songs || []
            };
            appState.setlists.push(newSetlist);
            saveData();
            broadcast({
              type: 'setlistCreated',
              setlist: newSetlist
            });
          }
          break;

        case 'updateSetlist':
          if (sender.isHost) {
            const idx = appState.setlists.findIndex(s => s.id === message.setlist.id);
            if (idx !== -1) {
              appState.setlists[idx] = message.setlist;
              saveData();
              broadcast({
                type: 'setlistUpdated',
                setlist: message.setlist
              });
            }
          }
          break;

        case 'deleteSetlist':
          if (sender.isHost) {
            appState.setlists = appState.setlists.filter(s => s.id !== message.id);
            saveData();
            broadcast({
              type: 'setlistDeleted',
              id: message.id
            });
          }
          break;

        case 'deleteSong':
          if (sender.isHost) {
            const songId = message.id;
            // Remove do repertório
            appState.songs = appState.songs.filter(s => s.id !== songId);
            // Remove dessa música de todas as setlists
            appState.setlists = appState.setlists.map(sl => ({
              ...sl,
              songs: sl.songs.filter(sid => sid !== songId)
            }));
            // Se era a música atual, limpa
            if (appState.currentSong && appState.currentSong.id === songId) {
              appState.currentSong = null;
              appState.currentSongIndex = null;
            }
            saveData();
            broadcast({
              type: 'songDeleted',
              id: songId,
              setlists: appState.setlists
            });
          }
          break;

        case 'requestState':
          ws.send(JSON.stringify({
            type: 'stateSync',
            state: appState,
            clientsCount: connectedClients.size
          }));
          break;
      }
    } catch (err) {
      console.error('Erro processando mensagem:', err);
    }
  });

  // Desconexão
  ws.on('close', () => {
    const client = connectedClients.get(clientId);
    if (client) {
      console.log(`🔌 Desconectado: ${clientId}`);
      connectedClients.delete(clientId);

      // Se era o host, novo host é escolhido
      if (client.isHost) {
        hostClient = null;
        const remaining = Array.from(connectedClients.values());
        if (remaining.length > 0) {
          hostClient = remaining[0];
          hostClient.isHost = true;
          console.log(`🎸 Novo HOST: ${hostClient.id}`);
          broadcast({
            type: 'newHost',
            clientId: hostClient.id
          });
        }
      }

      broadcast({
        type: 'clientsUpdate',
        clientsCount: connectedClients.size
      });
    }
  });
});

// Iniciar servidor
loadData();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════╗
║    🎸 CIFRAHUB - Show ao Vivo 🎸      ║
╚════════════════════════════════════════╝

Servidor rodando em: http://0.0.0.0:${PORT}

Para conectar:
- Mesma rede Wi-Fi/LAN
- Abra: http://<seu-ip>:${PORT}

Músicas carregadas: ${appState.songs.length}
  `);
});
