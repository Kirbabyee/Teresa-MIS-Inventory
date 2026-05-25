#!/usr/bin/env node
// Admin helper: drop_table.js
// Usage: PG_CONNECTION_STRING="postgres://..." node scripts/drop_table.js inventory_table_name

const { Client } = require('pg');
const readline = require('readline');

async function confirm(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt + ' (y/N): ', (ans) => {
      rl.close();
      resolve(String(ans || '').toLowerCase().startsWith('y'));
    });
  });
}

async function main() {
  const table = process.argv[2];
  if (!table) {
    console.error('Usage: PG_CONNECTION_STRING="postgres://..." node scripts/drop_table.js <table_name>');
    process.exit(2);
  }

  const conn = process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL;
  if (!conn) {
    console.error('Error: set PG_CONNECTION_STRING (or DATABASE_URL) to your Supabase/Postgres connection string.');
    process.exit(2);
  }

  console.log('About to drop table (CASCADE):', table);
  const ok = await confirm('Are you sure you want to DROP this table from the database?');
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  const client = new Client({ connectionString: conn });
  try {
    await client.connect();
    const safeTable = table.replace(/"/g, '');
    const sql = `DROP TABLE IF EXISTS "${safeTable}" CASCADE;`;
    console.log('Running:', sql);
    const res = await client.query(sql);
    console.log('Done. Table dropped (if it existed).');
  } catch (err) {
    console.error('Error executing drop:', err.message || err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
