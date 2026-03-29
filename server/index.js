import 'dotenv/config';
import { createServer } from './src/app.js';
import { env } from './src/config/env.js';
import { logger } from './src/lib/logger.js';

const app = createServer();
const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info(`Maple Rentals API listening on port ${env.PORT}`);
});

const shutdown = (signal) => {
  logger.info(`Received ${signal}. Shutting down Maple Rentals API.`);
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
