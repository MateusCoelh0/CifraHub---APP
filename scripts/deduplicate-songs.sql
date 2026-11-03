-- ==============================================================================
-- Script de Limpeza de Músicas Duplicadas e Criação de Constraint Única - CifraHub
-- Mantém a música mais antiga de cada grupo (band_id, título, artista)
-- Atualiza as referências em playlist_songs antes de apagar as duplicadas
-- ==============================================================================

-- PASSO 1: Pré-visualizar registros duplicados que serão consolidados
WITH RankedSongs AS (
  SELECT
    id,
    band_id,
    title,
    artist,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY band_id, lower(trim(title)), lower(trim(artist))
      ORDER BY created_at ASC, id ASC
    ) as row_num,
    FIRST_VALUE(id) OVER (
      PARTITION BY band_id, lower(trim(title)), lower(trim(artist))
      ORDER BY created_at ASC, id ASC
    ) as keep_id
  FROM songs
)
SELECT
  id AS duplicate_id,
  keep_id AS id_preservado,
  band_id,
  title AS titulo,
  artist AS artista,
  created_at
FROM RankedSongs
WHERE row_num > 1;

-- PASSO 2: Atualizar referências em playlist_songs para o ID mantido
WITH DuplicatesMapping AS (
  SELECT
    id AS duplicate_id,
    FIRST_VALUE(id) OVER (
      PARTITION BY band_id, lower(trim(title)), lower(trim(artist))
      ORDER BY created_at ASC, id ASC
    ) AS keep_id
  FROM songs
)
UPDATE playlist_songs ps
SET song_id = dm.keep_id
FROM DuplicatesMapping dm
WHERE ps.song_id = dm.duplicate_id
  AND dm.duplicate_id != dm.keep_id;

-- PASSO 3: Limpar possíveis duplicidades dentro da mesma playlist após atualização
DELETE FROM playlist_songs a
USING playlist_songs b
WHERE a.playlist_id = b.playlist_id
  AND a.song_id = b.song_id
  AND a.position > b.position;

-- PASSO 4: Deletar registros duplicados mantendo o mais antigo de cada grupo
WITH RankedSongs AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY band_id, lower(trim(title)), lower(trim(artist))
      ORDER BY created_at ASC, id ASC
    ) as row_num
  FROM songs
)
DELETE FROM songs
WHERE id IN (
  SELECT id FROM RankedSongs WHERE row_num > 1
);

-- PASSO 5: Criar índice único para impedir duplicidade de título e artista na mesma banda
CREATE UNIQUE INDEX IF NOT EXISTS songs_band_title_artist_idx
ON songs (band_id, lower(trim(title)), lower(trim(artist)));
