import "dotenv/config";
import { defineConfig } from "prisma/config";

// DATABASE_URL must be set in the shell environment or a .env file loaded
// externally before running prisma CLI commands. Prisma 7 does not support
// loading .env files from within prisma.config.ts via dotenv.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "",
  },
});
