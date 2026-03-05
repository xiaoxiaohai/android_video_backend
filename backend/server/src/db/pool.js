import pg from 'pg';
import fs from 'node:fs';
import { config } from '../config.js';

const { Pool } = pg;

function buildSslConfig() {
  const mode = String(config.dbSslMode || '').toLowerCase();

  // Temporary bypass for initial connectivity checks.
  if (mode === 'no-verify') {
    return { rejectUnauthorized: false };
  }

  if (config.dbSslCaPath) {
    const ca = fs.readFileSync(config.dbSslCaPath, 'utf-8');
    return {
      rejectUnauthorized: true,
      ca
    };
  }

  // Let pg infer from DATABASE_URL if no explicit SSL env is provided.
  return undefined;
}

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  ssl: buildSslConfig()
});

export async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
