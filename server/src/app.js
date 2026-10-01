import express from 'express';
import helmet from 'helmet';
import { pool } from './db/pool.js';

const app = express();

app.use(helmet());
app.use(express.json({ limit: '10kb' }));

app.get('/api/health', async (_request, response, next) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'Internal server error' });
});

export default app;
