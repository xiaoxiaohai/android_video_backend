import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const schemaPath = path.resolve(__dirname, '../../sql/schema.sql');
  const sql = await fs.readFile(schemaPath, 'utf-8');
  await pool.query(sql);
  await pool.end();
  console.log('schema migrated');
}

run().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
