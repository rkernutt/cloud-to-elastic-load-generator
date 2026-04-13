import { describe, it, expect } from "vitest";
import { AWS_SETUP_BUNDLE } from "./awsAssets";

describe("AWS_SETUP_BUNDLE", () => {
  it("has unique ML job ids across all job files (no duplicate React / installer keys)", () => {
    const ids = AWS_SETUP_BUNDLE.mlJobFiles.flatMap((f) => f.jobs.map((j) => j.id));
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const id of ids) {
      if (seen.has(id)) dups.push(id);
      else seen.add(id);
    }
    expect(dups, `duplicate job ids: ${dups.join(", ")}`).toEqual([]);
  });

  it("loads dashboards and ML job files", () => {
    expect(AWS_SETUP_BUNDLE.dashboards.length).toBeGreaterThan(0);
    expect(AWS_SETUP_BUNDLE.mlJobFiles.length).toBeGreaterThan(0);
  });
});
