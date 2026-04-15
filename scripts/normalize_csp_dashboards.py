#!/usr/bin/env python3
"""
Normalize overview-style Lens dashboards across AWS/GCP/Azure installers:
- Metric KPI: STATS c = COUNT() -> `Log events` = COUNT() (readable Lens label)
- AWS: migrate queries from event.outcome to log.level (matches enrich.ts mapping)
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRS = [
    ROOT / "installer/aws-custom-dashboards",
    ROOT / "installer/gcp-custom-dashboards",
    ROOT / "installer/azure-custom-dashboards",
]

METRIC_COUNT_RE = re.compile(r"\|\s*STATS\s+c\s*=\s*COUNT\(\)\s*$")


def fix_metric_panels(data: dict) -> bool:
    changed = False
    for panel in data.get("panels", []):
        if panel.get("type") != "lens":
            continue
        attrs = panel.get("config", {}).get("attributes", {})
        if attrs.get("type") != "metric":
            continue
        ds = attrs.get("dataset", {})
        if ds.get("type") != "esql":
            continue
        q = ds.get("query", "")
        nq = METRIC_COUNT_RE.sub("| STATS `Log events` = COUNT()", q)
        if nq != q:
            ds["query"] = nq
            changed = True
            for m in attrs.get("metrics", []):
                if m.get("type") == "primary" and m.get("column") == "c":
                    m["column"] = "Log events"
    return changed


def aws_text_fixes(text: str) -> str:
    """Apply to serialized JSON (json.dumps) so inner query quotes appear as \\\"."""
    t = text
    t = t.replace("BY o = event.outcome", "BY o = log.level")
    t = t.replace('"title": "Outcome"', '"title": "Log level"')
    # JSON-escaped quotes inside ES|QL strings
    t = re.sub(r'event\.outcome == \\"success\\"', r'log.level == \\"info\\"', t)
    t = re.sub(r'event\.outcome == \\"failure\\"', r'log.level == \\"error\\"', t)
    t = t.replace("`event.outcome`", "`log.level`")
    t = t.replace("outcome = event.outcome", "outcome = log.level")
    t = t.replace(", event.outcome,", ", log.level,")
    t = t.replace(", event.outcome |", ", log.level |")
    t = t.replace("event.outcome | SORT", "log.level | SORT")
    t = t.replace(
        '{ "operation": "value", "column": "event.outcome", "label": "Outcome" }',
        '{ "operation": "value", "column": "log.level", "label": "Log level" }',
    )
    t = t.replace(
        '{ "operation": "value", "column": "event.outcome", "label": "Outcome" },',
        '{ "operation": "value", "column": "log.level", "label": "Log level" },',
    )
    # Multiline Lens datatable / metric column defs (pretty-printed json.dumps)
    t = re.sub(
        r'"column": "event\.outcome",\s*\n(\s*)"label": "Outcome"',
        r'"column": "log.level",\n\1"label": "Log level"',
        t,
    )
    return t


def main() -> None:
    metric_files = 0
    aws_changed = 0
    for d in DIRS:
        if not d.is_dir():
            continue
        for path in sorted(d.glob("*-dashboard.json")):
            raw = path.read_text(encoding="utf-8")
            data = json.loads(raw)
            if fix_metric_panels(data):
                metric_files += 1
            out = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
            if "aws-custom-dashboards" in str(path):
                new_out = aws_text_fixes(out)
                if new_out != out:
                    aws_changed += 1
                out = new_out
                json.loads(out)  # validate
            path.write_text(out, encoding="utf-8")
    print(f"Metric KPI relabeled (`Log events`) in {metric_files} dashboard file(s).")
    print(f"AWS dashboards touched by event.outcome -> log.level: {aws_changed}.")


if __name__ == "__main__":
    main()
