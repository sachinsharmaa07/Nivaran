import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@nivaran/shared": path.resolve(__dirname, "./packages/shared/src/index.ts"),
      pg: path.resolve(__dirname, "./apps/api/node_modules/pg"),
      mongoose: path.resolve(__dirname, "./apps/api/node_modules/mongoose"),
      "node-pg-migrate": path.resolve(__dirname, "./apps/api/node_modules/node-pg-migrate"),
    },
  },
  test: {
    fileParallelism: false,
    globalSetup: [path.resolve(__dirname, "./apps/api/src/__tests__/setup.ts")],
    env: {
      NODE_ENV: "test",
      POSTGRES_OWNER_URL:
        "postgresql://nivaran_owner:nivaran_owner_pass@localhost:5432/nivaran_test",
      POSTGRES_APP_URL: "postgresql://nivaran_owner:nivaran_owner_pass@localhost:5432/nivaran_test",
      MONGO_URI: "mongodb://localhost:27017/nivaran_test?directConnection=true",
    },
    projects: [
      {
        extends: "./apps/web/vite.config.ts",
        test: {
          name: "web",
          root: "./apps/web",
          environment: "node",
          include: ["src/__tests__/**/*.{test,spec}.{ts,tsx}"],
        },
      },
      {
        test: {
          name: "api",
          root: "./apps/api",
          environment: "node",
          fileParallelism: false,
          include: ["src/__tests__/**/*.{test,spec}.ts"],
          setupFiles: [path.resolve(__dirname, "./apps/api/src/__tests__/test-hooks.ts")],
        },
      },
    ],
  },
});
