import { app, startServer } from './src/app/createApp.js';
import { closePool } from './src/db/pool.js';

export { app };
export default app;

const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10_000);

async function shutdown(server: import('node:http').Server, signal: string): Promise<void> {
  console.log(`Received ${signal}; starting graceful shutdown`);

  const forceExit = setTimeout(() => {
    console.error(`Graceful shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  forceExit.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    await closePool();
    console.log('Graceful shutdown completed');
  } catch (error) {
    console.error('Graceful shutdown failed:', error);
    process.exitCode = 1;
  } finally {
    clearTimeout(forceExit);
  }
}

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  startServer()
    .then((server) => {
      let shuttingDown = false;

      const handleSignal = (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;

        void shutdown(server, signal).finally(() => {
          process.exit();
        });
      };

      process.once('SIGTERM', () => handleSignal('SIGTERM'));
      process.once('SIGINT', () => handleSignal('SIGINT'));
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exitCode = 1;
    });
}
