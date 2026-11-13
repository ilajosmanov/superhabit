import { defineConfig } from 'drizzle-kit';

// `vp exec drizzle-kit generate` writes a migration for each schema change; commit them.
// `vp exec drizzle-kit migrate` applies them to the D1 in Cloudflare (load ../.env first; see README.md).
export default defineConfig({
  dialect: 'sqlite',
  driver: 'd1-http',
  schema: './src/db/schema.ts',
  out: './migrations',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    databaseId: 'f860f868-cf0c-4ebf-8eba-7c1569c09d2c',
    token: process.env.CLOUDFLARE_API_TOKEN ?? '',
  },
});
