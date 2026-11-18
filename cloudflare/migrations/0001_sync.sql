-- CoWatch v1 encrypted sync vault.
-- Records are ciphertext only. No API credentials, video bytes, or plaintext
-- audience/worldbook data are stored on the server.
CREATE TABLE IF NOT EXISTS sync_vaults (
  owner_hash TEXT PRIMARY KEY NOT NULL,
  ciphertext TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
