const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./smartpavement.db", (err) => {
  if (err) {
    console.error("Error al conectar DB:", err.message);
  } else {
    console.log("SQLite conectado");
  }
});

db.serialize(() => {

    db.run(`
  CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    source_type TEXT,
    description TEXT,
    impact REAL,
    speed REAL,
    latitude REAL,
    longitude REAL,
    risk_level TEXT,
    status TEXT DEFAULT 'registrado',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS manual_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      description TEXT,
      image_url TEXT,
      latitude REAL,
      longitude REAL,
      synced INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS automatic_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      impact REAL,
      speed REAL,
      latitude REAL,
      longitude REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

});

module.exports = db;