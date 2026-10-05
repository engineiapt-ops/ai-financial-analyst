import { app, startServer } from './src/app/createApp.js';

export { app };
export default app;

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
  });
}
