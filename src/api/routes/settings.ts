import { FastifyPluginAsync } from 'fastify';

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/database', async () => {
    const rawUrl = process.env['DATABASE_URL'] ?? 'file:corebooks.db';

    if (rawUrl.startsWith('postgresql://') || rawUrl.startsWith('postgres://')) {
      return { type: 'postgresql', path: null };
    }

    // SQLite: strip the file: prefix to get the actual path.
    const path = rawUrl.startsWith('file:') ? rawUrl.slice(5) : rawUrl;
    return { type: 'sqlite', path };
  });
};
