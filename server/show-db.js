const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, 'data', 'civicpulse.sqlite');

async function main() {
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(new Uint8Array(fileBuffer));

  // List all tables
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log('========== ALL TABLES ==========');
  const tableNames = tables[0]?.values.map(r => r[0]) || [];
  console.log(tableNames.join(', '));
  console.log('');

  // Show data from each table
  for (const table of tableNames) {
    const count = db.exec(`SELECT COUNT(*) FROM "${table}"`);
    const rowCount = count[0]?.values[0][0] || 0;
    console.log(`\n========== ${table} (${rowCount} rows) ==========`);
    if (rowCount > 0) {
      const result = db.exec(`SELECT * FROM "${table}" LIMIT 10`);
      if (result[0]) {
        console.log('Columns:', result[0].columns.join(' | '));
        console.log('-'.repeat(80));
        result[0].values.forEach((row, i) => {
          console.log(`Row ${i+1}:`, row.map((v, ci) => `${result[0].columns[ci]}=${v}`).join(' | '));
        });
      }
    }
  }

  db.close();
}

main().catch(console.error);
