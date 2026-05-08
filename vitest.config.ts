import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./worker/index.ts",
      miniflare: {
        compatibilityDate: "2025-04-01",
        compatibilityFlags: ["nodejs_compat"],
        bindings: {
          ADMIN_SECRET: "test-admin-secret",
          ENGINE_BASE_URL: "https://engine.example.test",
          ENGINE_API_KEY: "test-engine-key",
          BARUCH_BASE_URL: "https://baruch.example.test",
          BARUCH_API_KEY: "test-baruch-key",
        },
        kvNamespaces: ["AUTH_KV"],
      },
    }),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
