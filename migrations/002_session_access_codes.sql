-- Adiciona códigos curtos para entrada de convidados em sessões ao vivo.
BEGIN;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_code char(6);

DO $$
DECLARE
  current_session RECORD;
  generated_code char(6);
BEGIN
  FOR current_session IN
    SELECT id FROM sessions WHERE status = 'LIVE' AND session_code IS NULL
  LOOP
    LOOP
      generated_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM sessions
        WHERE status = 'LIVE' AND session_code = generated_code
      );
    END LOOP;

    UPDATE sessions SET session_code = generated_code WHERE id = current_session.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_live_session_code_idx
  ON sessions (session_code)
  WHERE status = 'LIVE' AND session_code IS NOT NULL;

COMMIT;
