#!/usr/bin/env python3
"""Check layout.nix against macSKK's kana-rule.conf.

Run after regenerating or hand-editing layout.nix:

    nix-instantiate --eval --strict --json layout.nix > /tmp/layout.json
    python3 tools/verify-layout.py /tmp/layout.json \
        "/Library/Input Methods/macSKK.app/Contents/Resources/kana-rule.conf"

Exits non-zero if anything fails.
"""
import json
import sys
from pathlib import Path

LAYOUT = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
KANA_RULE = Path(sys.argv[2])

THIRTY_KEYS = (set("qwertyuiop") | set("asdfghjkl") | {"semicolon"}
               | set("zxcvbnm") | {"comma", "period", "slash"})

# ------------------------------------------------------------ romaji engine
rules: dict[str, tuple[str, str]] = {}
for line in KANA_RULE.read_text(encoding="utf-8").splitlines():
    if not line.strip() or line.lstrip().startswith("#"):
        continue
    f = line.split(",")
    if len(f) < 2:
        continue
    rules[f[0].replace("&comma;", ",").replace("&sharp;", "#")] = (
        f[1].replace("&comma;", ",").replace("&sharp;", "#"),
        f[4] if len(f) >= 5 else "",
    )

PREFIXES = {r[:i] for r in rules for i in range(1, len(r) + 1)}


def simulate(seq: str) -> str | None:
    out, buf = [], ""
    for ch in seq:
        buf += ch
        if buf not in PREFIXES:
            return None
        if buf in rules and not any(p.startswith(buf) and len(p) > len(buf)
                                    for p in PREFIXES):
            hira, pending = rules[buf]
            out.append(hira)
            buf = pending
    return None if buf else "".join(out)


failures: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        failures.append(message)


# 1. Every romaji sequence must reproduce exactly its kana with nothing pending.
for group in ("single", "shift", "combos"):
    for e in LAYOUT[group]:
        got = simulate(e["romaji"])
        check(got == e["kana"],
              f"{group}: {e['romaji']!r} produces {got!r}, expected "
              f"{e['kana']!r}")

# 2. A chord must not repeat a key, and one key set must mean one kana.
seen: dict[frozenset, str] = {}
for e in LAYOUT["combos"]:
    ks = frozenset(e["keys"])
    check(len(ks) == len(e["keys"]),
          f"chord {e['keys']} repeats a key")
    if ks in seen:
        check(seen[ks] == e["kana"],
              f"chord {sorted(ks)} maps to both {seen[ks]!r} and {e['kana']!r}")
    seen[ks] = e["kana"]

# 3. Only the 30 core keys may appear.
used: set[str] = set()
for group in ("single", "shift"):
    used |= {e["key"] for e in LAYOUT[group]}
for e in LAYOUT["combos"]:
    used |= set(e["keys"])
check(not (used - THIRTY_KEYS),
      f"keys outside the 30-key block: {sorted(used - THIRTY_KEYS)}")

# ------------------------------------------------------------------- report
two = [frozenset(e["keys"]) for e in LAYOUT["combos"] if len(e["keys"]) == 2]
three = [frozenset(e["keys"]) for e in LAYOUT["combos"] if len(e["keys"]) == 3]
subsets = sum(1 for t in two if any(t < th for th in three))

print(f"single={len(LAYOUT['single'])} shift={len(LAYOUT['shift'])} "
      f"combos={len(LAYOUT['combos'])} (2-key={len(two)}, 3-key={len(three)})")
print(f"two-key chords that are a subset of a three-key chord: "
      f"{subsets}/{len(two)}")
print("  -> the generator must emit three-key rules before two-key rules")

if failures:
    print(f"\n{len(failures)} failure(s):")
    for f in failures:
        print(f"  {f}")
    sys.exit(1)
print("\nall checks passed")
