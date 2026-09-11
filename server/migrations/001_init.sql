-- Nós: a verdade sobre existência e hierarquia.
-- parent_id NULL = filho do canvas raiz.
CREATE TABLE nodes (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT REFERENCES nodes(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('folder', 'note', 'file')),
  title      TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX idx_nodes_parent ON nodes (parent_id, deleted_at);

CREATE TABLE notes (
  node_id  TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  markdown TEXT NOT NULL DEFAULT ''
);

-- Blobs endereçados por conteúdo, deduplicados por refcount.
CREATE TABLE blobs (
  sha      TEXT PRIMARY KEY,
  size     INTEGER NOT NULL,
  refcount INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE files (
  node_id        TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  blob_sha       TEXT NOT NULL REFERENCES blobs(sha),
  mime           TEXT NOT NULL,
  size           INTEGER NOT NULL,
  original_name  TEXT NOT NULL,
  extracted_text TEXT,
  extract_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extract_status IN ('pending', 'done', 'skipped', 'error'))
);

-- Um documento tldraw por pasta. node_id = id da pasta, ou '__root__'.
-- Sem FK: '__root__' não é um nó.
CREATE TABLE canvases (
  node_id    TEXT PRIMARY KEY,
  snapshot   TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Índice de busca alimentado pela aplicação (ver server/search.ts).
CREATE VIRTUAL TABLE node_fts USING fts5 (
  node_id UNINDEXED,
  title,
  body,
  tokenize = "unicode61 remove_diacritics 2"
);
