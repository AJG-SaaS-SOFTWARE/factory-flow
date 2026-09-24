#!/usr/bin/env python3
"""Validation exhaustive des niveaux Factory Flow.
Recherche par BFS une séquence gagnante pour chaque niveau avec les règles du prototype.
"""
from collections import deque
from pathlib import Path
import json, re, sys

ROOT = Path(__file__).resolve().parents[1]
text = (ROOT / "levels.js").read_text(encoding="utf-8")
m = re.search(r"window\.FACTORY_FLOW_LEVELS\s*=\s*(\[.*\])\s*;\s*$", text, re.S)
if not m:
    raise SystemExit("Impossible de lire levels.js")
LEVELS = json.loads(m.group(1))

def solve(level):
    colors = tuple(level["machines"].keys())
    proc = {c: level["machines"][c].get("processing", 0) for c in colors}
    start = (
        tuple(level["queue"]), tuple(),
        tuple(0 for _ in colors),
        tuple(level["machines"][c].get("maintenance", 0) for c in colors),
    )
    q = deque([(start, [])])
    seen = {start}
    while q:
        (incoming, buf, busy, maint), path = q.popleft()
        if not incoming and not buf:
            return path
        bd, md = dict(zip(colors, busy)), dict(zip(colors, maint))
        ready = lambda c: bd[c] == 0 and md[c] == 0
        actions = []
        if incoming:
            c = incoming[0]
            if ready(c): actions.append(("in", 0, c))
            if len(buf) < level["buffer"]: actions.append(("buffer", 0, c))
        for i, c in enumerate(buf):
            if ready(c): actions.append(("buf", i, c))
        for kind, i, c in actions:
            ni, nb, nbd, nmd = list(incoming), list(buf), bd.copy(), md.copy()
            if kind == "in":
                ni.pop(0); nbd[c] = proc[c] + 1
            elif kind == "buffer":
                ni.pop(0); nb.append(c)
            else:
                nb.pop(i); nbd[c] = proc[c] + 1
            for cc in colors:
                if nmd[cc] > 0: nmd[cc] -= 1
                elif nbd[cc] > 0: nbd[cc] -= 1
            ns = (tuple(ni), tuple(nb), tuple(nbd[c] for c in colors), tuple(nmd[c] for c in colors))
            if ns not in seen:
                seen.add(ns); q.append((ns, path + [f"{kind}:{c}"]))
    return None

def main():
    failed = 0
    for i, level in enumerate(LEVELS, 1):
        sol = solve(level)
        if sol is None:
            failed += 1
            print(f"FAIL L{i:02d} {level['title']}: aucune solution")
        else:
            print(f"OK   L{i:02d} {level['title']}: {len(sol)} actions minimum")
    if failed:
        print(f"\n{failed} niveau(x) invalide(s)")
        return 1
    print(f"\nTous les {len(LEVELS)} niveaux sont solvables.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
