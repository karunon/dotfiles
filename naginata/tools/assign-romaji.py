#!/usr/bin/env python3
"""Assign romaji to every kana in parse-v18.py's output and emit layout.nix.

Every assigned romaji is replayed through a model of macSKK's romaji trie
(see simulate) to prove it commits one kana at a time and leaves no pending
romaji behind. If a kana cannot be produced by a single rule, it falls back to
composing "base kana + small kana" and verifies that instead.

Usage:
    parse-v18.py naginata-v18.txt > parsed.json
    assign-romaji.py parsed.json \
        "/Library/Input Methods/macSKK.app/Contents/Resources/kana-rule.conf" \
        ../layout.nix review.tsv
"""
import json
import sys
from pathlib import Path

PARSED = Path(sys.argv[1])
KANA_RULE = Path(sys.argv[2])
OUT_NIX = Path(sys.argv[3])
OUT_TSV = Path(sys.argv[4])

# ------------------------------------------------------------ kana-rule.conf
rules: dict[str, tuple[str, str]] = {}       # romaji -> (hiragana, pending)
for line in KANA_RULE.read_text(encoding="utf-8").splitlines():
    if not line.strip() or line.lstrip().startswith("#"):
        continue
    f = line.split(",")
    if len(f) < 2:
        continue
    romaji = f[0].replace("&comma;", ",").replace("&sharp;", "#")
    hira = f[1].replace("&comma;", ",").replace("&sharp;", "#")
    pending = f[4] if len(f) >= 5 else ""
    rules[romaji] = (hira, pending)

PREFIXES = set()
for r in rules:
    for i in range(1, len(r) + 1):
        PREFIXES.add(r[:i])


def simulate(seq: str) -> str | None:
    """Replay macSKK's romaji conversion.

    A rule only commits when no longer rule shares its prefix; otherwise
    macSKK keeps the input pending waiting for another keystroke. Returns None
    when the sequence dead-ends or leaves anything pending, which is what
    disqualifies e.g. "n" for ん (because "na", "ni", "nn" ... extend it).
    """
    out, buf = [], ""
    for ch in seq:
        buf += ch
        if buf not in PREFIXES:
            return None                                  # dead end
        exact = buf in rules
        longer = any(p.startswith(buf) and len(p) > len(buf) for p in PREFIXES)
        if exact and not longer:
            hira, pending = rules[buf]
            out.append(hira)
            buf = pending
    return None if buf else "".join(out)


# --------------------------------------------------------- romaji assignment
SMALL = set("ぁぃぅぇぉゃゅょゎ") | {"ヵ", "ヶ"}

_cache: dict[str, str | None] = {}


def assign(kana: str) -> str | None:
    if kana in _cache:
        return _cache[kana]

    # Prefer a single rule, shortest first: fewer synthetic key events.
    cands = sorted((r for r, (h, p) in rules.items() if h == kana and not p),
                   key=lambda r: (len(r), r))
    for r in cands:
        if simulate(r) == kana:
            _cache[kana] = r
            return r

    # Otherwise compose "base kana + small kana". This is how ぐぃ ぐぇ ぐぉ
    # くゎ ぐゎ are produced, since macSKK's default table has no single rule
    # for them. The resulting text is identical.
    if len(kana) == 2 and kana[1] in SMALL:
        head, tail = assign(kana[0]), assign(kana[1])
        if head and tail and simulate(head + tail) == kana:
            _cache[kana] = head + tail
            return head + tail

    _cache[kana] = None
    return None


# --------------------------------------------------------------- categories
DAKUTEN = set("がぎぐげござじずぜぞだぢづでどばびぶべぼゔ")
HANDAKUTEN = set("ぱぴぷぺぽ")


def category(kana: str) -> str:
    if kana in SMALL:
        return "small"
    if len(kana) == 1:
        if kana in DAKUTEN:
            return "dakuten"
        if kana in HANDAKUTEN:
            return "handakuten"
        return "seion"
    if len(kana) == 2 and kana[1] in "ゃゅょ":
        if kana[0] in DAKUTEN:
            return "dakuten-youon"
        if kana[0] in HANDAKUTEN:
            return "handakuten-youon"
        return "youon"
    return "extended"


# ------------------------------------------------------------------ convert
d = json.loads(PARSED.read_text(encoding="utf-8"))
missing: list[str] = []
rows: list[dict] = []


def resolve(plane: str, keys: list[str], kana: str) -> dict:
    r = assign(kana)
    if r is None:
        missing.append(kana)
    return {"plane": plane, "keys": keys, "kana": kana,
            "romaji": r or "", "category": category(kana)}


for k, kana in sorted(d["single"].items()):
    rows.append(resolve("single", [k], kana))
for k, kana in sorted(d["shift"].items()):
    rows.append(resolve("shift", [k], kana))
for c in d["combos"]:
    rows.append(resolve("combo", c["keys"], c["kana"]))

if missing:
    print("no romaji found for:", missing, file=sys.stderr)
    sys.exit(1)

# --------------------------------------------------------------- review TSV
with OUT_TSV.open("w", encoding="utf-8") as fh:
    fh.write("plane\tkeys\tkana\tromaji\tcategory\tsimulated\n")
    for r in rows:
        fh.write(f"{r['plane']}\t{'+'.join(r['keys'])}\t{r['kana']}\t"
                 f"{r['romaji']}\t{r['category']}\t{simulate(r['romaji'])}\n")

# ---------------------------------------------------------------- layout.nix
KEY_NAMES = {
    "q": "q", "w": "w", "e": "e", "r": "r", "t": "t", "y": "y", "u": "u",
    "i": "i", "o": "o", "p": "p", "a": "a", "s": "s", "d": "d", "f": "f",
    "g": "g", "h": "h", "j": "j", "k": "k", "l": "l", ";": "semicolon",
    "z": "z", "x": "x", "c": "c", "v": "v", "b": "b", "n": "n", "m": "m",
    ",": "comma", ".": "period", "/": "slash",
}

CATEGORY_LABEL = {
    "dakuten": "dakuten (voiced)",
    "handakuten": "handakuten (semi-voiced)",
    "small": "small kana",
    "youon": "youon (palatalised)",
    "dakuten-youon": "voiced youon",
    "handakuten-youon": "semi-voiced youon",
    "extended": "extended / foreign sounds",
}

CATEGORY_ORDER = ["dakuten", "handakuten", "small", "youon",
                  "dakuten-youon", "handakuten-youon", "extended"]

# Physical order (top row -> bottom row) reads far better than alphabetical.
KEY_ORDER = {k: i for i, k in enumerate(
    list("qwertyuiop") + list("asdfghjkl;") + list("zxcvbnm,./"))}


def nix_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def entry(r: dict, with_keys: bool) -> str:
    if with_keys:
        ordered = sorted(r["keys"], key=lambda k: KEY_ORDER[k])
        keys = " ".join(nix_str(KEY_NAMES[k]) for k in ordered)
        head = f"keys = [ {keys} ];"
    else:
        head = f"key = {nix_str(KEY_NAMES[r['keys'][0]])};"
    return (f"    {{ {head} kana = {nix_str(r['kana'])}; "
            f"romaji = {nix_str(r['romaji'])}; }}")


def by_layout(r: dict) -> int:
    return KEY_ORDER[r["keys"][0]]


def diagram(plane_rows: list[dict], title: str) -> list[str]:
    """Draw a plane the way it sits on the keyboard."""
    import unicodedata

    def width(s: str) -> int:
        return sum(2 if unicodedata.east_asian_width(c) in "WF" else 1
                   for c in s)

    m = {r["keys"][0]: r["kana"] for r in plane_rows}
    out = [f"  # {title}", "  #"]
    for row in ("qwertyuiop", "asdfghjkl;", "zxcvbnm,./"):
        cells = []
        for k in row:
            cell = f"{k}={m.get(k, '-')}"
            cells.append(cell + " " * max(0, 6 - width(cell)))
        out.append("  #   " + " ".join(cells).rstrip())
    out.append("  #")
    return out


lines: list[str] = []
A = lines.append

A("# Naginata-shiki v18 layout table (kana only).")
A("#")
A("# GENERATED by tools/assign-romaji.py. See README.md to regenerate.")
A("#")
A("# Source: 大岡俊彦, \"薙刀式配列v18（トップ版）\" (Yamabuki-R definition)")
A("#   https://oookaworks.up.seesaa.net/image/E89699E58880E5BC8Fv18.txt")
A("#")
A("# This table is IME independent: it maps a kana to the set of physical keys")
A("# that produce it. `romaji` is the keystroke sequence handed to the IME.")
A("#")
A("# REQUIRES macSKK's STOCK kana-rule.conf (verified against 2.8.0 and")
A("# 2.14.0). Every sequence commits one kana at a time and leaves no pending")
A("# romaji there, so the stock table needs no edits.")
A("#")
A("# It is NOT compatible with this repo's AZIK rule (macSKK/azik-overrides.conf).")
A("# That rule redefines xa/xi/xu/xe/xo as the sha-row and turns kw/gw/tw/dw/th/dh")
A("# into two-vowel expansions, which breaks 31 of the sequences below. Select a")
A("# stock/plain-romaji rule while using this layout. See README.md.")
A("#")
A("# Key names use Karabiner-Elements key_code spelling. Note that ー is the one")
A("# entry whose romaji is not a letter: emit it as the `hyphen` key_code.")
A("# The center shift is the space bar: hold it to reach the shift plane.")
A("#")
A("# Out of scope on purpose: symbols, letters, the number row, the v18 edit")
A("# modes and the proper-noun shortcuts.")
A("{")
A("  meta = {")
A('    version = "v18";')
A('    source = "https://oookaworks.up.seesaa.net/image/E89699E58880E5BC8Fv18.txt";')
A('    author = "Toshihiko Ooka (大岡俊彦)";')
A("  };")
A("")
A("  # Held to reach the shift plane.")
A('  centerShift = "spacebar";')
A("")
A("  # Chord role keys. Not used by the generator; kept as a reading aid.")
A("  roleKeys = {")
for label, name, note in [
    ("leftDakuten", "左濁", "voices right-hand kana"),
    ("rightDakuten", "右濁", "voices left-hand kana"),
    ("leftHandakuten", "左半", "semi-voices right-hand kana"),
    ("rightHandakuten", "右半", "semi-voices left-hand kana"),
    ("small", "小", "makes the kana small"),
]:
    A(f'    {label} = {nix_str(KEY_NAMES[d["alias"][name]])};  # {name}: {note}')
A("  };")
A("")

singles = sorted((r for r in rows if r["plane"] == "single"), key=by_layout)
shifts = sorted((r for r in rows if r["plane"] == "shift"), key=by_layout)
combos = [r for r in rows if r["plane"] == "combo"]

lines.extend(diagram(singles, f"Unshifted plane ({len(singles)})"))
A("  #   q has no unshifted kana (it is the small-kana chord key).")
A("  #   t y u are edit keys -> optional.editing")
A("  #")
A("  single = [")
for r in singles:
    A(entry(r, with_keys=False))
A("  ];")
A("")
lines.extend(diagram(shifts, f"Shift plane: hold spacebar ({len(shifts)})"))
A("  #   t y are Shift+Left / Shift+Right -> optional.editing")
A("  #   v m are 、/。 followed by Enter   -> optional.punctuation")
A("  #")
A("  shift = [")
for r in shifts:
    A(entry(r, with_keys=False))
A("  ];")
A("")
A(f"  # Chords ({len(combos)}). Press order does not matter: Karabiner's")
A("  # from.simultaneous is order insensitive, so v18's mirrored definitions")
A("  # collapse into one entry each.")
A("  #")
A("  # Evaluate three-key chords before two-key ones: every two-key chord")
A("  # below is a subset of at least one three-key chord.")
A("  combos = [")
for cat in CATEGORY_ORDER:
    group = sorted((r for r in combos if r["category"] == cat),
                   key=lambda r: (len(r["keys"]),
                                  [KEY_ORDER[k] for k in r["keys"]]))
    if not group:
        continue
    A(f"    # -- {CATEGORY_LABEL[cat]} ({len(group)})")
    for r in group:
        A(entry(r, with_keys=True))
A("  ];")
A("")
A("  # Present in v18 but outside the kana scope. Wire these up if wanted.")
A("  optional = {")
A("    editing = [")
for o in d["optional"]:
    if o["action"] in ("left", "right", "backspace", "shift_left",
                       "shift_right"):
        keys = " ".join(nix_str(KEY_NAMES[k]) for k in o["keys"])
        A(f'      {{ plane = {nix_str(o["plane"])}; keys = [ {keys} ]; '
          f'action = {nix_str(o["action"])}; }}')
A("    ];")
A("    punctuation = [")
for o in d["optional"]:
    if o["action"] in ("kuten_enter", "touten_enter"):
        keys = " ".join(nix_str(KEY_NAMES[k]) for k in o["keys"])
        A(f'      {{ plane = {nix_str(o["plane"])}; keys = [ {keys} ]; '
          f'action = {nix_str(o["action"])}; }}')
A("    ];")
A("  };")
A("}")

OUT_NIX.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"single={len(singles)} shift={len(shifts)} combos={len(combos)} "
      f"total={len(rows)}")
