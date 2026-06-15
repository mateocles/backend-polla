import { defineConfig } from '@prisma/config';

export default defineConfig({
  earlyAccess: true,
  migrate: {
    databaseUrl: process.env.DATABASE_URL,
  },
});
