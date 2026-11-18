import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';
import { Repo } from './repo.ts';

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DB_PATH ?? 'data/chowluck.db';
const timeZone = process.env.APP_TIMEZONE ?? 'Asia/Shanghai';

mkdirSync(dirname(dbPath), { recursive: true });
const repo = new Repo(dbPath);
const app = createApp({ repo, timeZone });

// In production the same process serves the built front end from dist/.
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

const server = serve({ fetch: app.fetch, port }, info => {
  console.log(`ChowLuck API listening on http://localhost:${info.port} (db: ${dbPath}, tz: ${timeZone})`);
});

const shutdown = () => {
  server.close();
  repo.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
