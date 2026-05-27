import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import path from "path";
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
  resolve: {
    // Mirror the main vite.config.ts alias so tests-under-pool resolve
    // value imports through the `@/` prefix. Type-only `@/...` imports
    // are erased before runtime so they didn't surface this gap until
    // the first sibling-lib value import landed (#166 PR B,
    // `src/lib/config-api.ts` → `src/lib/config-url.ts`).
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
