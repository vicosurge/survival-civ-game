CREATE TABLE IF NOT EXISTS feedback (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  submitted_at TEXT    NOT NULL,
  tester_name  TEXT    NOT NULL,
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback     TEXT    NOT NULL,
  version      TEXT    NOT NULL
);
