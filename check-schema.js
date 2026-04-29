const { getDb } = require('./lib/database-bun.ts');

const db = getDb();
const columns = db.query('PRAGMA table_info(aft_requests)').all();

console.log('Total columns:', columns.length);
columns.forEach((col, i) => {
  console.log(`${i + 1}. ${col.name}`);
});
