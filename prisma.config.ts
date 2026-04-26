import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Used by Prisma CLI (migrate, introspect). Falls back to a local file so
    // users who haven't set DATABASE_URL get a working database automatically.
    url: process.env['DATABASE_URL'] ?? 'file:corebooks.db',
  },
});
