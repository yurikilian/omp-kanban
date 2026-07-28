// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(dirname, "../../../../../tests/fixtures/audits");
let homeDirectory: string;

async function copyAuditFixture(name: string) {
  await fs.cp(
    path.join(fixtureRoot, name),
    path.join(homeDirectory, ".omp", "forensics", "audits", name),
    { recursive: true },
  );
}

beforeEach(async () => {
  homeDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "omp-audit-route-"));
  vi.spyOn(os, "homedir").mockReturnValue(homeDirectory);
  await copyAuditFixture("bundle-valid");
  await copyAuditFixture("bundle-incomplete");
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(homeDirectory, { recursive: true, force: true });
});

describe("GET /api/audits/[auditId]", () => {
  it("returns a validated completed audit's structured detail (E4-S8-AC1)", async () => {
    const response = await GET(new Request("http://panel.test/api/audits/bundle-valid"), {
      params: Promise.resolve({ auditId: "bundle-valid" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      auditId: "bundle-valid",
      findings: [
        {
          id: "finding-1",
          severity: "low",
          confidence: "medium",
          estimatedSavings: { inputTokens: { minimum: 2000, likely: 3200, maximum: 3800 } },
        },
      ],
    });
  });

  it("withholds a completed-looking bundle until validation succeeds (E4-S8-AC1)", async () => {
    const response = await GET(new Request("http://panel.test/api/audits/bundle-incomplete"), {
      params: Promise.resolve({ auditId: "bundle-incomplete" }),
    });

    expect(response.status).toBe(404);
  });
});
