import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@nivaran/shared": path.resolve(__dirname, "./packages/shared/src/index.ts"),
    },
  },
  test: {
    fileParallelism: false,
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
        },
      },
    ],
  },
});
