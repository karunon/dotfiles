#!/usr/bin/env python3
"""Parse the Naginata-shiki v18 layout definition (Yamabuki-R format) into JSON.

Input is the upstream definition file converted to UTF-8:

    curl -fsSL https://oookaworks.up.seesaa.net/image/E89699E58880E5BC8Fv18.txt \
      | iconv -f SHIFT_JIS -t UTF-8 > naginata-v18.txt

Output is a JSON document describing "kana -> set of physical keys". Romaji
assignment is done separately by assign-romaji.py.

Scope: kana only. Symbols, letters, the number row, the edit modes and the
proper-noun shortcuts of v18 are intentionally not extracted.
"""
import json
import re
import sys
from pathlib import Path

SRC = Path(sys.argv[1])

# --------------------------------------------------------------- key layout
# Rows as laid out in the scancode table at the top of the upstream file.
ROWS = [
    # The number row is out of scope, but is kept so row indices line up.
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "^", "yen"],
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "@", "["],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", ":", "]"],
    ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/", "ro"],
]

SCANCODE_TO_KEY = {
    "10": "q", "11": "w", "12": "e", "13": "r", "14": "t", "15": "y",
    "16": "u", "17": "i", "18": "o", "19": "p", "1A": "@", "1B": "[",
    "1E": "a", "1F": "s", "20": "d", "21": "f", "22": "g", "23": "h",
    "24": "j", "25": "k", "26": "l", "27": ";", "28": ":", "29": "]",
    "2C": "z", "2D": "x", "2E": "c", "2F": "v", "30": "b", "31": "n",
    "32": "m", "33": ",", "34": ".", "35": "/", "73": "ro",
}

# Accepted cell values: hiragana + prolonged sound mark, the small katakana
# ka/ke, and the v-row. v18 writes the v-row with katakana vu (U+30F4), which
# is normalised to hiragana vu (U+3094) because that is the SKK reading form.
KANA_RE = re.compile(r"^(?:[ぁ-ゖー]+|[ヵヶ]|ヴ[ぁ-ゖ]?)$")

# Edit keys and punctuation are outside the "kana only" scope, but are worth
# carrying through so they can be enabled later without re-parsing.
OPTIONAL_VALUES = {
    "{←}": "left", "{→}": "right", "{BS}": "backspace",
    "+{←}": "shift_left", "+{→}": "shift_right",
    # 、 is 読点 (touten), 。 is 句点 (kuten).
    "、{Enter}": "touten_enter", "。{Enter}": "kuten_enter",
}


def normalize_kana(value: str) -> str:
    return value.replace("ヴ", "ゔ")


# --------------------------------------------------------------- preprocess
text = SRC.read_text(encoding="utf-8")
# Strip /* ... */ comments. They span lines and also appear inside table cells.
text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)

lines = text.splitlines()

# ------------------------------------------------------------ alias section
# `-option-input[ ... ]` maps readable names to scancodes, e.g. `{右濁}| +24`.
alias: dict[str, str] = {}      # name -> key ("shift" means the center shift)
i = 0
while i < len(lines):
    if lines[i].strip().startswith("-option-input["):
        i += 1
        while i < len(lines) and lines[i].strip() != "]":
            m = re.match(r"^\{(.+?)\}\s*\|\s*\+(\S+)\s*$", lines[i].strip())
            if m:
                name, code = m.group(1), m.group(2)
                alias[name] = ("shift" if code == "shift"
                               else SCANCODE_TO_KEY[code.upper()])
            i += 1
        break
    i += 1

# -------------------------------------------------------- definition blocks
BLOCK_RE = re.compile(r"^\((.*?)\[\s*$")
MODS_RE = re.compile(r"^(\{[^}]+\})+$")

blocks: list[tuple[list[str], list[str]]] = []   # (modifier names, body lines)
i = 0
seen_option = False
while i < len(lines):
    stripped = lines[i].strip()

    if stripped.startswith("-option-input["):
        seen_option = True
        while i < len(lines) and lines[i].strip() != "]":
            i += 1
        i += 1
        continue

    mods: list[str] | None = None
    if stripped == "[" and seen_option:
        mods = []                                    # unshifted plane
    else:
        m = BLOCK_RE.match(stripped)
        if m:
            spec = m.group(1).strip()
            if MODS_RE.match(spec):                  # accept `{..}{..}` only
                mods = re.findall(r"\{([^}]+)\}", spec)
            # `(+23, ({S}+23[`, `(+20+21[` etc. are the function and edit-mode
            # sections. They are out of scope, so leave mods as None.

    if mods is None:
        i += 1
        continue

    body: list[str] = []
    i += 1
    while i < len(lines) and lines[i].strip() != "]":
        if lines[i].strip():
            body.append(lines[i])
        i += 1
    i += 1
    blocks.append((mods, body))

# ------------------------------------------------------------- expand cells
entries: list[dict] = []
optional: list[dict] = []
skipped: list[dict] = []

for mods, body in blocks:
    if len(body) != 4:
        skipped.append({"reason": f"row count {len(body)}", "mods": mods})
        continue

    is_shift = mods == ["S"]
    if is_shift:
        mod_keys: list[str] = []
    else:
        try:
            mod_keys = [alias[m] for m in mods]
        except KeyError as e:
            skipped.append({"reason": f"unknown alias {e}", "mods": mods})
            continue
        if "shift" in mod_keys:
            skipped.append({"reason": "mixed center-shift", "mods": mods})
            continue

    for row_idx, line in enumerate(body):
        if row_idx == 0:
            continue                                  # number row: out of scope
        cells = line.split("|")[:-1]                  # trailing pipe
        keys = ROWS[row_idx]
        for col_idx, cell in enumerate(cells):
            if col_idx >= len(keys):
                continue
            value = cell.strip()
            if not value:
                continue
            key = keys[col_idx]
            record = {"mods": mods, "modKeys": mod_keys, "key": key,
                      "value": value, "shift": is_shift}
            if key in ("@", "[", ":", "]", "ro", "^", "yen"):
                skipped.append({"reason": "out-of-scope key", **record})
                continue
            if value in OPTIONAL_VALUES:
                optional.append({"action": OPTIONAL_VALUES[value], **record})
                continue
            if not KANA_RE.match(value):
                skipped.append({"reason": "not kana", **record})
                continue
            record["value"] = normalize_kana(value)
            entries.append(record)

# ------------------------------------------------------ normalise and dedupe
# v18 spells every chord twice ("逆順の定義") because Yamabuki-R distinguishes
# press order. Collapsing on the key set removes that duplication.
single: dict[str, str] = {}
shift: dict[str, str] = {}
combos: dict[frozenset, str] = {}
conflicts: list[dict] = []


def put(store, k, kana, ctx):
    if k in store and store[k] != kana:
        conflicts.append({"where": ctx, "key": str(k), "a": store[k], "b": kana})
        return
    store[k] = kana


for e in entries:
    if e["shift"]:
        put(shift, e["key"], e["value"], "shift")
    elif not e["modKeys"]:
        put(single, e["key"], e["value"], "single")
    else:
        keyset = frozenset(e["modKeys"] + [e["key"]])
        if len(keyset) != len(e["modKeys"]) + 1:
            skipped.append({"reason": "modifier equals key", **e})
            continue
        put(combos, keyset, e["value"], "combo")

out = {
    "alias": alias,
    "single": single,
    "shift": shift,
    "combos": [
        {"keys": sorted(k), "kana": v} for k, v in
        sorted(combos.items(), key=lambda kv: (len(kv[0]), sorted(kv[0])))
    ],
    "optional": [
        {
            "plane": "shift" if o["shift"] else ("single" if not o["modKeys"]
                                                 else "combo"),
            "keys": sorted(set(o["modKeys"] + [o["key"]])),
            "action": o["action"],
        }
        for o in optional
    ],
    "conflicts": conflicts,
    "skipped": skipped,
}
json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
