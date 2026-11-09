import { describe, expect, it } from "vitest";
import ciYml from "../.github/workflows/ci.yml?raw";
import previewYml from "../.github/workflows/deploy-pr.yml?raw";
import prodYml from "../.github/workflows/deploy-prod.yml?raw";
import stagingYml from "../.github/workflows/deploy-staging.yml?raw";

/**
 * Branching model (develop = integration, main = release):
 * - CI runs on pushes to both branches and on every PR (no base filter).
 * - A PR into main must come from develop or hotfix/* (Release Source job).
 * - Staging deploys when a PR into develop merges — never on a release PR
 *   (develop → main) merge.
 * - Per-PR preview workers deploy for PRs into develop and main.
 * - Production deploys only from a v* release tag that is on main.
 */
function onBlock(yml: string): string {
  return yml.slice(yml.indexOf("\non:"), yml.indexOf("\njobs:"));
}

describe("workflow triggers follow the develop/main branching model", () => {
  it("CI runs on push to main and develop, and on every pull_request", () => {
    const on = onBlock(ciYml);
    expect(on).toMatch(/push:\s*\n\s*branches: \[main, develop\]/);
    // No base filter on pull_request (see the #330 note in ci.yml).
    expect(on).toMatch(/pull_request:\s*\n(?!\s+branches:)/);
  });

  it("CI refuses a PR into main unless its head is develop or hotfix/*", () => {
    expect(ciYml).toContain("name: Release Source");
    expect(ciYml).toContain(
      "github.event_name == 'pull_request' && github.base_ref == 'main'"
    );
    expect(ciYml).toContain("develop|hotfix/*)");
  });

  it("staging deploys only when a PR into develop merges", () => {
    const on = onBlock(stagingYml);
    expect(on).toMatch(/pull_request:\s*\n\s*branches: \[develop\]/);
    expect(on).not.toMatch(/branches: \[[^\]]*main/);
    expect(stagingYml).toContain("github.event.pull_request.merged == true");
  });

  it("per-PR preview workers deploy for PRs into develop and main", () => {
    expect(onBlock(previewYml)).toMatch(
      /pull_request:\s*\n\s*branches: \[develop, main\]/
    );
  });

  it("production refuses anything but a v* tag on main, before deploying", () => {
    expect(prodYml).not.toContain("refs/heads/main");
    expect(prodYml).toContain("refs/tags/v*)");
    const guardAt = prodYml.indexOf("name: Require a release tag on main");
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(prodYml.indexOf("wrangler deploy"));
    expect(prodYml).toContain("git fetch --no-tags origin main");
    expect(prodYml).toContain(
      'git merge-base --is-ancestor "$GITHUB_SHA" origin/main'
    );
    expect(prodYml).toMatch(/fetch-depth: 0/);
    expect(prodYml).toMatch(/deploy:[\s\S]*needs: ci/);
  });
});
