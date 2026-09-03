#!/usr/bin/env python3
"""Check the generated Karabiner rule for coverage, ordering and key repeat.

    nix-instantiate --eval --strict --json --expr \
      '{ title = "x"; rules = [ (import ./karabiner.nix {
           lib = (import <nixpkgs> {}).lib; }).rule ]; }' > /tmp/naginata.json
    python3 tools/verify-karabiner.py /tmp/naginata.json

The coverage check is the important one. A key inside the 30-key block with no
manipulator on a given plane falls through to macSKK and gets run through the
romaji table, so a gap is not "nothing happens" -- a bare `u` would type う.
Every gap therefore has to be deliberate, and this lists them explicitly.
"""
import json
import sys
from pathlib import Path

THIRTY_KEYS = (list("qwertyuiop") + list("asdfghjkl") + ["semicolon"]
               + list("zxcvbnm") + ["comma", "period", "slash"])

# plane -> keys that are meant to have no manipulator, and why.
EXPECTED_GAPS = {
    ("single", False): {
        "q": "falls through to macSKK's hiragana/katakana toggle",
    },
    ("single", True): {
        "q": "falls through to macSKK's ⇧Q (start unconfirmed input)",
        "semicolon": "S-; stays + ; ー has no upper-case romaji",
        "slash": "S-/ stays ? ; ▽れ is Shift+space+/",
        "t": "arrow key, no ▽ form",
        "y": "arrow key, no ▽ form",
        "u": "backspace, no ▽ form",
    },
    ("shift", False): {
        "q": "falls through to macSKK's hiragana/katakana toggle",
    },
    ("shift", True): {
        "q": "falls through to macSKK's ⇧Q (start unconfirmed input)",
        "t": "Shift+Left, no ▽ form",
        "y": "Shift+Right, no ▽ form",
        "v": "、 , no ▽ form",
        "m": "。 , no ▽ form",
    },
}

# Manipulators whose last `to` event may repeat, by the key they fire from.
REPEAT_ALLOWED = {"t", "y"}

data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
manipulators = data["rules"][0]["manipulators"]

failures: list[str] = []


def fail(message: str) -> None:
    failures.append(message)


def is_shifted(m: dict) -> bool:
    return "shift" in m["from"].get("modifiers", {}).get("mandatory", [])


def plane_of(m: dict) -> str | None:
    """"shift" when gated on the center shift being held, "single" when gated on
    it being free, None when the manipulator does not care."""
    for c in m.get("conditions", []):
        if c.get("name") == "naginata_shift":
            return "shift" if c["type"] == "variable_if" else "single"
    return None


single_keys: dict[tuple[str, bool], set[str]] = {k: set() for k in EXPECTED_GAPS}
chords: list[tuple[int, frozenset, bool]] = []
single_index: dict[tuple[str, bool, str], int] = {}

for i, m in enumerate(manipulators):
    frm = m["from"]
    shifted = is_shifted(m)
    plane = plane_of(m)

    if "simultaneous" in frm:
        keys = frozenset(e["key_code"] for e in frm["simultaneous"])
        chords.append((i, keys, shifted))
        continue

    key = frm.get("key_code")
    if key == "spacebar":
        continue
    if plane is None:
        fail(f"[{i}] single key {key!r} is not gated on naginata_shift")
        continue
    single_keys[(plane, shifted)].add(key)
    single_index[(plane, shifted, key)] = i

# 1. Coverage: every one of the 30 keys is either mapped or a declared gap.
for (plane, shifted), expected in EXPECTED_GAPS.items():
    mapped = single_keys[(plane, shifted)]
    gaps = [k for k in THIRTY_KEYS if k not in mapped]
    label = f"{plane}/{'shifted' if shifted else 'plain'}"
    for k in gaps:
        if k not in expected:
            fail(f"{label}: {k!r} has no manipulator and no declared reason "
                 f"-- it will fall through to macSKK's romaji table")
    for k in expected:
        if k in mapped:
            fail(f"{label}: {k!r} is declared as a gap but is mapped")
    print(f"{label}: {len(mapped)}/{len(THIRTY_KEYS)} mapped, "
          f"{len(gaps)} declared gap(s)")

# 2. Ordering: Karabiner takes the first match, so every chord must be listed
#    before any single-key manipulator that uses one of its keys.
for plane, shifted, key in single_index:
    idx = single_index[(plane, shifted, key)]
    for ci, keys, cshift in chords:
        if key in keys and ci > idx:
            fail(f"chord {sorted(keys)} is listed at {ci}, after the "
                 f"{plane}/{'shifted' if shifted else 'plain'} {key!r} "
                 f"manipulator at {idx}")

three = [i for i, keys, _ in chords if len(keys) == 3]
two = [i for i, keys, _ in chords if len(keys) == 2]
if three and two and max(three) > min(two):
    fail("some three-key chords are listed after two-key chords")

# 3. Key repeat: only the last `to` event repeats while the from key is held.
for i, m in enumerate(manipulators):
    to = m.get("to", [])
    if not to or "key_code" not in to[-1]:
        continue
    key = m["from"].get("key_code")
    if to[-1].get("repeat") is False or key in REPEAT_ALLOWED:
        continue
    fail(f"[{i}] from={key or sorted(e['key_code'] for e in m['from']['simultaneous'])} "
         f"last to event {to[-1]['key_code']!r} may repeat while held")

print(f"\nmanipulators={len(manipulators)} chords={len(chords)} "
      f"(3-key={len(three)}, 2-key={len(two)})")

if failures:
    print(f"\n{len(failures)} failure(s):")
    for f in failures:
        print(f"  {f}")
    sys.exit(1)
print("\nall checks passed")
