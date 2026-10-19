import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
          include: ["src/__tests__/**/*.{test,spec}.ts"],
        },
      },
    ],
  },
});
