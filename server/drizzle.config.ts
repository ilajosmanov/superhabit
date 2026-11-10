import { defineConfig } from 'drizzle-kit';

// `vp exec drizzle-kit generate` writes a migration for each schema change; commit them.
// `vp exec drizzle-kit migrate` applies them to the D1 in Cloudflare (reads ../cloudflare.env's variables).
export default defineConfig({
  dialect: 'sqlite',
  driver: 'd1-http',
  schema: './src/db/schema.ts',
  out: './migrations',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    databaseId: 'd685360b-811c-4fbb-a26e-f3ba0277db58',
    token: process.env.CLOUDFLARE_API_TOKEN ?? '',
  },
});
