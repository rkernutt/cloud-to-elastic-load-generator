#!/usr/bin/env python3
"""Insert fourth arg `{ spanFailed: expr }` into enrichAzureTraceDoc(span, traceId, lang)."""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
TRACES = ROOT / "src/azure/generators/traces"


def find_matching_paren(s: str, open_idx: int) -> int | None:
    depth = 0
    i = open_idx
    in_str: str | None = None
    while i < len(s):
        c = s[i]
        if in_str:
            if c == "\\":
                i += 2
                continue
            if c == in_str:
                in_str = None
            i += 1
            continue
        if c in "'\"":
            in_str = c
            i += 1
            continue
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return None


def patch_text_once(text: str) -> tuple[str, bool]:
    """
    Single pass replacing one enriched call each time caller loops.
    Returns (possibly_new_text, did_change).
    """
    needle = "enrichAzureTraceDoc("
    j = 0
    while True:
        k = text.find(needle, j)
        if k < 0:
            return text, False
        open_paren = k + len(needle) - 1
        close_paren = find_matching_paren(text, open_paren)
        if close_paren is None:
            j = open_paren + 1
            continue

        inner = text[open_paren + 1 : close_paren]
        if "{ spanFailed" in inner:
            j = close_paren + 1
            continue

        if not re.search(
            r'processor:\s*\{\s*name:\s*"transaction"\s*,\s*event:\s*"span"\s*\}',
            inner,
        ):
            j = close_paren + 1
            continue

        em = re.search(r"event:\s*\{\s*outcome:\s*([^}]+)\}", inner)
        if not em:
            j = close_paren + 1
            continue

        fm = re.match(
            r"^(.+?)\s*\?\s*\"failure\"\s*:\s*\"success\"\s*$",
            em.group(1).strip(),
        )
        if not fm:
            j = close_paren + 1
            continue
        predicate = fm.group(1).strip()
        if "\n" in predicate:
            j = close_paren + 1
            continue

        inner_rs = inner.rstrip()
        lm = re.search(
            r",\s*traceId\s*,\s*((?:\"(?:[^\"\\]|\\.)*\"|\\w+))\s*\Z", inner_rs, re.DOTALL
        )
        if not lm:
            j = close_paren + 1
            continue

        insertion = ", { spanFailed: " + predicate + " }"
        abs_ins = open_paren + 1 + lm.end(1)
        new_text = text[:abs_ins] + insertion + text[abs_ins:]
        return new_text, True


def main() -> int:
    skipped: list[str] = []
    for path in sorted(TRACES.glob("*.ts")):
        if path.name in ("index.ts", "services.ts", "trace-kit.ts", "trace-invariants.test.ts"):
            continue
        original = path.read_text()
        if "enrichAzureTraceDoc(" not in original:
            continue

        txt = original
        n = 0
        safety = 0
        while safety < 200:
            safety += 1
            nt, ok = patch_text_once(txt)
            if not ok:
                break
            txt = nt
            n += 1

        if txt != original:
            path.write_text(txt)
            print(f"Patched {n} enrich calls: {path.name}")
            continue

        if (
            '"failure"' in original
            and "{ spanFailed:" not in original
            and "event: \"span\"" in original
        ):
            skipped.append(path.name)

    if skipped:
        sys.stderr.write("May need manual spanFailed wiring:\n  " + "\n  ".join(skipped) + "\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
