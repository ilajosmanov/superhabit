import { defineConfig } from 'drizzle-kit';

// `vp exec drizzle-kit generate` writes a migration for each schema change; commit them.
export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/storage/schema.ts',
  out: './src/storage/migrations',
});
