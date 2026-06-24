import { describe, it, expect } from "vitest";
import { kibanaSpacePath } from "./setupProxy";

describe("kibanaSpacePath", () => {
  it("returns the bare path for the default space", () => {
    expect(kibanaSpacePath("default", "/api/dashboards")).toBe("/api/dashboards");
  });

  it("returns the bare path when no space is provided", () => {
    expect(kibanaSpacePath(undefined, "/api/dashboards")).toBe("/api/dashboards");
    expect(kibanaSpacePath("", "/api/dashboards")).toBe("/api/dashboards");
  });

  it("prefixes /s/<space> for a non-default space", () => {
    expect(kibanaSpacePath("marketing", "/api/dashboards")).toBe("/s/marketing/api/dashboards");
  });

  it("preserves query strings", () => {
    expect(kibanaSpacePath("team-a", "/api/detection_engine/rules?rule_id=abc")).toBe(
      "/s/team-a/api/detection_engine/rules?rule_id=abc"
    );
  });

  it("encodes space ids with reserved characters", () => {
    expect(kibanaSpacePath("a b", "/api/x")).toBe("/s/a%20b/api/x");
  });

  it("tolerates a path missing the leading slash", () => {
    expect(kibanaSpacePath("ops", "api/workflows")).toBe("/s/ops/api/workflows");
  });
});
