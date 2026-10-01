import 'dotenv/config';
import app from './app.js';
import { pool } from './db/pool.js';

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
  console.log(`VisitVault API listening on port ${port}`);
});

async function shutdown() {
  server.close(async (error) => {
    if (error) {
      console.error('Error while closing the HTTP server:', error);
      process.exitCode = 1;
    }

    try {
      await pool.end();
    } catch (poolError) {
      console.error('Error while closing the database pool:', poolError);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
