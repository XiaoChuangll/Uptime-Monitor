const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'server/visitors.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error(err.message);
    return;
  }
  console.log('Connected to the database.');
});

db.all(`SELECT * FROM site_cards`, [], (err, rows) => {
  if (err) {
    throw err;
  }
  console.log('Current Site Cards:');
  console.table(rows);
});

db.close();
