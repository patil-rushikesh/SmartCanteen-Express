import { loadSecretsToProcessEnv } from './utils/secrets-loader.js';
import { env } from './utils/env.js';

const bootstrap = async (): Promise<void> => {
  await loadSecretsToProcessEnv();

  const [{ initializeRuntime, shutdownRuntime }, { startServer, stopServer }] = await Promise.all([
    import('./lib/runtime.js'),
    import('./index.js')
  ]);

  await initializeRuntime();
  const server = startServer();

  let isShuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    console.log(`[Bootstrap] Received ${signal}. Starting graceful shutdown...`);

    const forceExitTimer = setTimeout(() => {
      console.error('[Bootstrap] Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    try {
      await stopServer(server);
      await shutdownRuntime();
      clearTimeout(forceExitTimer);
      console.log('[Bootstrap] Graceful shutdown complete.');
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      console.error('[Bootstrap] Graceful shutdown failed:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
};

bootstrap().catch((error) => {
  console.error('[Bootstrap] Startup failed:', error);
  process.exit(1);
});
