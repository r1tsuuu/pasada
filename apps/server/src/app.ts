import cors from 'cors';
import express from 'express';
import type { AppContext } from './context';
import { env } from './env';
import { adminRoutes } from './routes/admin';
import { fillRoutes } from './routes/fills';
import { stateRoutes } from './routes/state';
import { veloWebhookRoute } from './routes/veloWebhook';

export function createApp(ctx: AppContext) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  // The webhook needs the raw body, so it is mounted before express.json().
  app.use(veloWebhookRoute(ctx));

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const o = origin.replace(/\/$/, '');
        cb(null, env.WEB_ORIGIN.includes('*') || env.WEB_ORIGIN.includes(o));
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false }));

  app.get('/', (_req, res) => res.json({ name: 'Pasada server', health: '/api/health' }));
  app.use(stateRoutes(ctx));
  app.use(fillRoutes(ctx));
  app.use(adminRoutes(ctx));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  });
  return app;
}
