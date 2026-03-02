import cors from 'cors';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';
import express from 'express';
import { db } from './db';
import { logger } from './db/logger';
import morgan from 'morgan';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';

app.use(cors({ origin: corsOrigin }));
app.use(express.json());
app.use(
  morgan(':method :url :status :response-time ms - :res[content-length]', {
    stream: {
      write: (message: string) => logger.http(message.trim()),
    },
  })
);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: '@repo/server',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/hello', (req, res) => {
  res.json({
    message: 'Hello from Express API',
  });
});

app.get('/api/db-health', async (req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({
      status: 'ok',
      database: 'connected',
    });
  } catch (error) {
    logger.error('Database health check failed: %o', error);
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
    });
  }
});

app.listen(port, () => {
  logger.info('Express server listening on http://localhost:%d', port);
});
