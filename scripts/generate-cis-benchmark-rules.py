#!/usr/bin/env python3
"""Fetch CIS rule metadata from elastic/cloudbeat and emit src/data/cisBenchmarkRules.ts."""

from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "cisBenchmarkRules.ts"

BENCHMARKS = [
    ("cis_aws", "CIS_AWS_RULES"),
    ("cis_gcp", "CIS_GCP_RULES"),
    ("cis_azure", "CIS_AZURE_RULES"),
    ("cis_eks", "CIS_EKS_RULES"),
    ("cis_k8s", "CIS_K8S_RULES"),
]

GITHUB_API = "https://api.github.com/repos/elastic/cloudbeat/contents/security-policies/bundle/compliance/{benchmark}/rules"
RAW_BASE = (
    "https://raw.githubusercontent.com/elastic/cloudbeat/main/security-policies/bundle/compliance"
)


def http_get(url: str, *, is_json: bool = False) -> bytes:
    """Fetch URL via curl (avoids Python SSL issues on some developer machines)."""
    headers = ["-H", "User-Agent: cloud-to-elastic-load-generator-cis-fetch/1.0"]
    if is_json:
        headers += ["-H", "Accept: application/vnd.github+json"]
    for attempt in range(5):
        try:
            out = subprocess.check_output(
                ["curl", "-fsSL", "--max-time", "120", *headers, url],
                stderr=subprocess.DEVNULL,
            )
            return out
        except subprocess.CalledProcessError:
            if attempt < 4:
                time.sleep(2**attempt)
                continue
            raise RuntimeError(f"Failed to fetch {url}")
    raise RuntimeError(f"Failed to fetch {url}")


def first_sentence(text: object) -> str:
    if text is None:
        return ""
    s = str(text).strip()
    if not s:
        return ""
    # Prefer first sentence ending with . ! ? (ignore common abbreviations heuristically)
    m = re.match(r"^(.+?[.!?])(?:\s|$)", s, flags=re.DOTALL)
    if m:
        return m.group(1).strip()
    return s.split("\n", 1)[0].strip()


def normalize_profile(p: object) -> str:
    if p is None:
        return ""
    s = str(p).strip()
    if "Level 2" in s:
        return "Level 2"
    if "Level 1" in s:
        return "Level 1"
    return s


def list_rule_dirs(benchmark: str) -> list[str]:
    url = GITHUB_API.format(benchmark=benchmark)
    data = json.loads(http_get(url, is_json=True).decode("utf-8"))
    if not isinstance(data, list):
        raise RuntimeError(f"Unexpected API response for {benchmark}: {type(data)}")
    names = []
    for item in data:
        if item.get("type") == "dir" and item.get("name"):
            names.append(item["name"])
    names.sort()
    return names


def load_rule(benchmark: str, rule_id: str) -> dict:
    url = f"{RAW_BASE}/{benchmark}/rules/{rule_id}/data.yaml"
    raw = http_get(url, is_json=False).decode("utf-8")
    doc = yaml.safe_load(raw)
    if not isinstance(doc, dict):
        raise RuntimeError(f"Invalid YAML for {benchmark}/{rule_id}")
    meta = doc.get("metadata") or {}
    if not isinstance(meta, dict):
        meta = {}
    bench = meta.get("benchmark") or {}
    if not isinstance(bench, dict):
        bench = {}
    posture = bench.get("posture_type")
    if posture not in ("cspm", "kspm"):
        posture = "kspm" if benchmark in ("cis_eks", "cis_k8s") else "cspm"

    tags = meta.get("tags")
    if tags is None:
        tags = []
    if not isinstance(tags, list):
        tags = [str(tags)]
    else:
        tags = [str(t) for t in tags]

    return {
        "id": str(meta.get("id") or ""),
        "name": str(meta.get("name") or "").strip(),
        "section": str(meta.get("section") or "").strip(),
        "profile": normalize_profile(meta.get("profile_applicability")),
        "description": first_sentence(meta.get("description")),
        "benchmark": {
            "name": str(bench.get("name") or "").strip(),
            "version": str(bench.get("version") or "").strip(),
            "id": str(bench.get("id") or benchmark).strip(),
            "rule_number": str(bench.get("rule_number") or "").strip(),
            "posture_type": posture,
        },
        "tags": tags,
    }


def ts_string(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def emit_rule_obj(r: dict) -> str:
    b = r["benchmark"]
    lines = [
        "  {",
        f"    id: {ts_string(r['id'])},",
        f"    name: {ts_string(r['name'])},",
        f"    section: {ts_string(r['section'])},",
        f"    profile: {ts_string(r['profile'])},",
        f"    description: {ts_string(r['description'])},",
        "    benchmark: {",
        f"      name: {ts_string(b['name'])},",
        f"      version: {ts_string(b['version'])},",
        f"      id: {ts_string(b['id'])},",
        f"      rule_number: {ts_string(b['rule_number'])},",
        f"      posture_type: {json.dumps(b['posture_type'])},",
        "    },",
        f"    tags: {json.dumps(r['tags'], ensure_ascii=False)},",
        "  }",
    ]
    return "\n".join(lines)


def main() -> int:
    all_exports: list[tuple[str, list[dict]]] = []
    for benchmark, const_name in BENCHMARKS:
        print(f"Listing {benchmark}...", file=sys.stderr)
        rule_ids = list_rule_dirs(benchmark)
        print(f"  {len(rule_ids)} rule directories", file=sys.stderr)
        rules: list[dict] = []
        for i, rid in enumerate(rule_ids):
            if i and i % 50 == 0:
                print(f"  ... {i}/{len(rule_ids)}", file=sys.stderr)
            try:
                rules.append(load_rule(benchmark, rid))
            except Exception as e:
                print(f"ERROR {benchmark}/{rid}: {e}", file=sys.stderr)
                raise
            time.sleep(0.02)
        all_exports.append((const_name, rules))

    header = """/**
 * CIS benchmark rule metadata sourced from elastic/cloudbeat security-policies.
 * Generated by scripts/generate-cis-benchmark-rules.py — do not edit by hand.
 *
 * @see https://github.com/elastic/cloudbeat/tree/main/security-policies/bundle/compliance
 */

export interface CisBenchmarkRule {
  id: string; // UUID from cloudbeat
  name: string; // Full rule name
  section: string; // e.g. "Identity and Access Management"
  profile: string; // "Level 1" or "Level 2"
  description: string; // First sentence of CIS description
  benchmark: {
    name: string;
    version: string;
    id: string;
    rule_number: string;
    posture_type: "cspm" | "kspm";
  };
  tags: string[];
}

"""

    parts = [header]
    for const_name, rules in all_exports:
        body = ",\n".join(emit_rule_obj(r) for r in rules)
        parts.append(f"export const {const_name}: CisBenchmarkRule[] = [\n{body}\n];\n\n")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("".join(parts).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote {OUT}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
