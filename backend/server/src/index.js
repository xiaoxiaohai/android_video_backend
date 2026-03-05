import { buildApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';

const app = buildApp();

const close = async () => {
  try {
    await app.close();
    await pool.end();
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', close);
process.on('SIGTERM', close);

app.listen({ port: config.port, host: '0.0.0.0' }).then(() => {
  app.log.info(`backend listening on ${config.port}`);
}).catch(async (err) => {
  app.log.error(err);
  await pool.end();
  process.exit(1);
});
