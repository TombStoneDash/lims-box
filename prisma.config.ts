import { defineConfig } from "prisma/config";

// When prisma.config.ts is present, Prisma skips automatic .env loading.
// Set DATABASE_URL fallback for local dev so `prisma migrate dev` works
// without a pre-existing .env file.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./dev.db";
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
});
