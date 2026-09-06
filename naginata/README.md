# Naginata-shiki (薙刀式) v18

Layout data for the Naginata-shiki v18 Japanese kana layout, kept as a single
Nix table so a Karabiner-Elements configuration can be generated from it.

Only the kana are covered. Symbols, letters, the number row, v18's edit modes
and its proper-noun shortcuts are intentionally left alone.

## Why this cannot live in macSKK's kana-rule.conf

`kana-rule.conf` is a sequential romaji prefix tree. Naginata-shiki needs two
things it cannot express:

1. **A center shift on the space bar.** Space may appear in the middle of a
   romaji string (the stock table has `z ,　`) but not at the front, and in
   kana mode space is the conversion key. That rules out the 22 kana that live
   on the shift plane.
2. **A timing window.** Without one, a chord cannot be told apart from two
   consecutive single presses, so `f` then `j` would always be が and かあ
   would become untypable.

macSKK has no simultaneous-keypress support (no such symbol exists in its
binary), so the chording has to happen below it.

## Architecture

```
physical keys
  |  Karabiner-Elements complex_modifications   <- generated from layout.nix
  |    chord detection (from.simultaneous, order insensitive)
  |    space bar center shift
  |    layer gated on macSKK's input mode
  |    emits plain romaji keystrokes
  v
macSKK (stock kana-rule.conf, unmodified)
  |
  v  SKK conversion, dictionaries, yaskkserv2 as before
```

The layer is gated with Karabiner's `input_source_if` condition:

```json
{ "type": "input_source_if",
  "input_sources": [
    { "input_mode_id": "^net\\.mtgto\\.inputmethod\\.macSKK\\.(hiragana|katakana|hankaku)$" }
  ] }
```

macSKK registers each of its modes as a separate `TISInputSourceID`
(`ComponentInputModeDict` in its `Info.plist`) and switches them through TIS,
so the condition tracks macSKK's own mode switching with no shadow state. Under
any other IME, or in macSKK's direct-input / full-width-alphanumeric modes, the
whole layer including the space bar remapping is inert.

Do not switch modes with Karabiner's `select_input_source` action: switching
into an input source that has an `input_mode_id` is documented as unreliable on
macOS. Send macSKK's own bindings (`Ctrl-J`, `l`) instead.

## Files

| Path | Role |
|---|---|
| `layout.nix` | The layout table. Generated, then reviewed by hand. |
| `karabiner.nix` | Turns `layout.nix` into a Karabiner complex_modifications rule |
| `kana-rule-extra.conf` | The `？` / `！` rows appended to macSKK's stock table |
| `default.nix` | Home Manager module: installs the rule and the kana rule |
| `tools/parse-v18.py` | Upstream v18 definition -> intermediate JSON |
| `tools/assign-romaji.py` | JSON + macSKK's kana-rule.conf -> `layout.nix` |
| `tools/verify-layout.py` | Checks `layout.nix` against macSKK's kana-rule.conf |
| `tools/verify-karabiner.py` | Checks the generated rule's coverage, ordering and key repeat |

## Decisions

### Center shift: pure dual-role space bar

```json
{ "from": { "key_code": "spacebar" },
  "to": [{ "set_variable": { "name": "naginata_shift", "value": 1 } }],
  "to_if_alone": [{ "key_code": "spacebar" }],
  "to_after_key_up": [{ "set_variable": { "name": "naginata_shift", "value": 0 } }] }
```

Holding the space bar reaches the shift plane for as long as it is held, and a
bare tap emits a space on key-up. This is what Yamabuki-R's center shift
actually does — it makes the space bar a real shift key — so it reproduces the
layout faithfully and puts no timing window on the first kana after the shift.

Inside kana mode that costs two things, both documented Karabiner behaviour:

- SKK's conversion fires on key-up rather than key-down, because `to_if_alone`
  "posts events when the from key is released".
- The space bar does not auto-repeat, because `to_if_alone` "posts both key_down
  and key_up events at the same time".

Holding the space bar past `basic.to_if_alone_timeout_milliseconds` (1000 ms by
default) emits no space at all, which is what you want when you were reaching
for the shift.

The alternative — matching `simultaneous` on space plus the first kana and
carrying the rest on the variable — keeps auto-repeat but requires the first
kana within `simultaneous_threshold_milliseconds` (50 ms by default), and still
delays a bare space by that threshold. `layout.nix` is shared between the two,
so switching is a change in `karabiner.nix` only.

### Chord windows

Karabiner's default `basic.simultaneous_threshold_milliseconds` is 50 ms, which
is too tight in practice — び (`j`+`x`) splits into ひあ or あひ. `karabiner.nix`
sets the parameter per manipulator instead of relying on the default, and the
two lengths can tune separately even though they currently share one value:

```nix
chordThresholdMs = {
  two = 250;
  three = 250;
};
```

Raise these if a chord splits into separate kana; lower them if two consecutive
kana fuse into a chord.

The cost of raising them is **latency on the single-key fallback**. Karabiner
computes each manipulator's window as `first key time + threshold`
(`basic.hpp`), all from the same starting timestamp, so a key that belongs to
several chords waits the **longest** of their windows — not the sum — before it
can resolve as a single kana.

19 of the 30 keys appear in some three-key chord, so at 250 ms most single kana
carry that much latency before they resolve as a single press. If that feels
laggy, split `three` back down toward the two-key value (or lower both): the
trade-off is chords getting harder to land, felt first in the rarer
foreign-sound ones (てぃ, ふぁ, ゔぁ … ).

### Shift+key starts ▽ instead of typing a capital

Every kana gets a shifted twin whose first romaji key carries the shift, so
`Shift+w` sends `K` then `i` and macSKK shows ▽き. Okurigana works the same way:
▽よ then `Shift+space+,` sends `M`, `u` and marks む as the okurigana.

Without this, `Shift+w` would reach macSKK as a bare `W`, which starts ▽ with
the **QWERTY** romaji `w` — nothing to do with Naginata's き — and the next
layer keystroke then wedges the pending buffer.

`mandatory` modifiers are removed from `to` events, so the shift is placed
explicitly on the first key and only on the first key. A second capital inside
▽ would mean "okurigana starts here".

Lost inside kana mode (everything still works in direct input):

| Key | Was | Now |
|---|---|---|
| `S-,` | `<` | ▽ん |
| `S-.` | `>`, macSKK's prefix/suffix mode | ▽ら |
| `S-l` | macSKK's full-width alphanumeric mode | ▽う |
| `S-x` | macSKK's delete-candidate | ▽ひ |

`S-;` stays `+` because ー's romaji `-` has no upper-case form. "Select previous
candidate" is bound to `x`, which the layer takes, but `↑` does the same job and
arrow keys are untouched. Anything else that matters can be moved to a `⌃`
combination in macSKK's keybinding settings — the layer never touches `⌃`.

### Tapping Shift arms ▽ for the next input

Shift plus a chord is a hard reach: ▽きょ means Shift plus `w` plus `i`, three
keys at once across both hands. So tapping Shift **on its own** arms a
Karabiner variable instead, which the pending-shift twin of the next shifted
key reads and clears. ▽きょ becomes: tap Shift, then the `w`+`i`+`j` chord
unshifted.

```nix
from = { key_code = "left_shift"; modifiers = { optional = [ "any" ]; }; };
to = [{ key_code = "left_shift"; lazy = true; }];
to_if_alone = [{ set_variable = { name = "naginata_pending_shift"; value = 1; }; }];
```

`lazy` keeps the modifier silent until another key joins it, which is the
documented pairing for `to_if_alone` on a modifier — so **holding** Shift still
works exactly as before and both routes stay live. Easy reaches keep using
Shift+key; awkward ones tap.

This used to send macSKK's Sticky Shift key (`semicolon`) instead of setting a
variable, on the theory that Sticky Shift marks the next input as a headword
the same way a real Shift does — one manipulator per shift key would then
cover singles, the shift plane, chords and okurigana alike, instead of a
second variable-gated copy of every one of the 158 shifted twins. It does not:
macSKK documents Sticky Shift as shifting only the *one physical keystroke it
is bound to*, not "the next kana however it arrives," so the synthetic
semicolon Karabiner sent landed on macSKK's own handling of that key — not on
the chord that followed — and a lone Shift tap surfaced as a stray っ instead
of arming anything. Tracking the pending state as a Karabiner variable costs
the extra manipulator per twin the original design tried to avoid, but it
means this rule never has to guess what macSKK does with the key it is sent.

The pending twin (`mkPending` in `karabiner.nix`) shares its trigger key with
the plain unshifted manipulator and must be listed before it, since Karabiner
takes the first manipulator that matches — see `bothVariants`.

### `？` and `！` are full-width in kana mode

The stock table has rows for `-` `,` `.` `[` `]` but none for `?` or `!`, so both
arrive raw. `kana-rule-extra.conf` adds them. Reachability:

- `?` is `S-/`. The unshifted plane deliberately has no shifted twin for slash,
  so `S-/` passes through. Nothing is lost, because れ sits on **both** planes —
  ▽れ is `Shift+space+/`.
- `!` is `S-1`, and the number row is out of scope, so it passes through.

### `q` needs no rule of its own

`q` has no kana on either plane in Naginata; it only appears in the small-kana
chords. A bare `q` therefore falls through to macSKK, where it is the
hiragana/katakana toggle, and `⇧Q` is "start unconfirmed input" — both for free.

Abbrev needs a new home because `/` is れ, so `q`+`/` sends a bare `/`.

### Nix owns the Karabiner rule

`default.nix` patches `~/.config/karabiner/karabiner.json` with `jq`, replacing
only the rule whose description is `Naginata-shiki v18 (kana)` and leaving every
other rule and setting alone. Enabling a rule in Karabiner's UI copies it into
`karabiner.json`, so writing the asset under
`assets/complex_modifications/` alone would never reach an already-enabled rule.
The asset is installed too, for inspection.

Disabling the rule in the UI is undone by the next `home-manager switch`.

## layout.nix

- `single` — 26 kana, one key each
- `shift` — 25 kana reached by holding the space bar
- `combos` — 108 chords (57 two-key, 51 three-key), press order irrelevant
- `optional` — v18's edit keys and `、`/`。`, parsed but not part of the kana scope

v18 spells every chord twice because Yamabuki-R distinguishes press order.
Karabiner's `from.simultaneous` does not, so the mirrored definitions collapse
into one entry each: 320-odd definitions upstream become 159 here.

### Romaji choice

Each kana carries the keystroke sequence handed to macSKK. Sequences are picked
shortest-first and then replayed through a model of macSKK's romaji trie, which
requires that the sequence commits one kana at a time and leaves nothing
pending. That check is what rejects `n` for ん (because `na`, `ni`, `nn` … all
extend it) and settles on `nn`.

Five kana have no single rule in macSKK's stock table and are composed from a
base kana plus a small kana instead. The resulting text is identical:

| kana | romaji |
|---|---|
| ぐぃ | `guxi` |
| ぐぇ | `guxe` |
| ぐぉ | `guxo` |
| くゎ | `kuxwa` |
| ぐゎ | `guxwa` |

So the **stock** table needs no edits. Verified against macSKK 2.8.0 and 2.14.0.

`ー` is the only entry whose romaji is not a letter (`-`); the Karabiner
generator must emit it as the `hyphen` key_code.

### Incompatible with this repo's AZIK rule

`macSKK/default.nix` writes a generated AZIK table to
`~/Library/Containers/net.mtgto.inputmethod.macSKK/Data/Documents/Settings/kana-rule.conf`,
and that is the table macSKK actually loads. **31 of the 159 sequences below
break under it**, because `azik-overrides.conf`:

- redefines `xa xi xu xe xo xwa` as the sha-row, so the small kana
  ぁぃぅぇぉゎ come out as しゃしぃしゅしぇしょ
- turns `kw gw tw dw th dh fw` into two-vowel expansions
  (`kwa` -> けいあ, `thi` -> つうい, `fwu` -> ふぇいう …)
- drops `sha/shu/sho`, `cha/chu/cho`, `she`, `che`, `thi/thu`, `dhi/dhu`, `fwu`

AZIK and Naginata-shiki are alternative input styles for the same kana mode, so
they cannot share one rule anyway. Select a stock/plain-romaji rule while using
this layout. macSKK 2.10.0 and later can hold several rules and switch between
them from Settings, which is the intended way to keep both.

Confirm which table is live before debugging any kana:

```sh
python3 tools/verify-layout.py /tmp/layout.json \
  "$HOME/Library/Containers/net.mtgto.inputmethod.macSKK/Data/Documents/Settings/kana-rule.conf"
```

`default.nix` writes `kana-rule-naginata.conf` next to it, and the layout is
verified against exactly that file (stock table + `kana-rule-extra.conf`), not
just against the stock table:

```sh
cat "$(nix build --no-link --print-out-paths nixpkgs#macskk)/Library/Input Methods/macSKK.app/Contents/Resources/kana-rule.conf" \
    kana-rule-extra.conf > /tmp/kana-rule-naginata.conf
python3 tools/verify-layout.py /tmp/layout.json /tmp/kana-rule-naginata.conf
```

## Regenerating

```sh
curl -fsSL https://oookaworks.up.seesaa.net/image/E89699E58880E5BC8Fv18.txt \
  | iconv -f SHIFT_JIS -t UTF-8 > /tmp/naginata-v18.txt

python3 tools/parse-v18.py /tmp/naginata-v18.txt > /tmp/parsed.json

# Point this at a STOCK kana-rule.conf, not the AZIK one in Settings/.
python3 tools/assign-romaji.py /tmp/parsed.json \
  "$(nix build --no-link --print-out-paths nixpkgs#macskk)/Library/Input Methods/macSKK.app/Contents/Resources/kana-rule.conf" \
  layout.nix /tmp/review.tsv
```

`review.tsv` lists every kana with its keys, chosen romaji and the simulated
output, which is the table to read when reviewing a regeneration.

The parser reports `conflicts` (one key set mapping to two different kana) and
`skipped` (cells it declined to use). Both should stay empty and symbol-only
respectively.

## Verifying

Run this after regenerating or hand-editing `layout.nix`:

```sh
nix-instantiate --eval --strict --json layout.nix > /tmp/layout.json

python3 tools/verify-layout.py /tmp/layout.json \
  "$(nix build --no-link --print-out-paths nixpkgs#macskk)/Library/Input Methods/macSKK.app/Contents/Resources/kana-rule.conf"
```

It checks that every romaji sequence reproduces exactly its kana with nothing
pending, that no chord repeats a key or maps one key set to two kana, and that
only the 30 core keys are used.

Current state:

```
single=26 shift=25 combos=108 (2-key=57, 3-key=51)
two-key chords that are a subset of a three-key chord: 30/57
```

That last number is why chord rules must be emitted longest-first.

Then the generated Karabiner rule, against Karabiner's own linter and the
coverage checker:

```sh
nix-instantiate --eval --strict --json --expr \
  '{ title = "Naginata-shiki v18";
     rules = [ (import ./karabiner.nix { lib = (import <nixpkgs> {}).lib; }).rule ]; }' \
  > /tmp/naginata-v18.json

'/Library/Application Support/org.pqrs/Karabiner-Elements/bin/karabiner_cli' \
  --lint-complex-modifications /tmp/naginata-v18.json

python3 tools/verify-karabiner.py /tmp/naginata-v18.json
```

Current state — 485 manipulators:

```
single/plain:   29/30 mapped, 1 declared gap(s)
single/shifted: 24/30 mapped, 6 declared gap(s)
shift/plain:    29/30 mapped, 1 declared gap(s)
shift/shifted:  25/30 mapped, 5 declared gap(s)
chords=325 (3-key=153, 2-key=172)
```

The `chords`/`single`/`shift` counts above are inflated by the pending-shift
twin described in "Tapping Shift arms ▽ for the next input": every entry with
a shifted twin gets three manipulators (mandatory-shift, pending-shift,
unshifted) instead of two.

### Why coverage is checked, not assumed

A key inside the 30-key block with **no** manipulator on a given plane does not
do nothing: it falls through to macSKK and gets run through the romaji table. A
bare `u` would type う, and 、 / 。 would be unreachable. So v18's non-kana cells
have to be wired up too — `t` `y` `u` as Left / Right / Backspace, and the shift
plane's `v` `m` as 、 / 。 (v18's trailing Enter dropped). `verify-karabiner.py`
requires every remaining gap to be declared with a reason.

### Two things to watch

Only the **last** event of a `to` array repeats while the from key is held, so
every sequence ends with `"repeat": false`. Without it, holding a kana key would
spray the last romaji letter — and in Naginata you hold keys constantly while
waiting to complete a chord. The arrows on `t` and `y` are the exception: those
two keys appear in no chord, so repeating them is safe and useful. Backspace is
not — `u` is part of the `f`+`u` chord for ざ, and a repeating backspace while
the other hand reaches for `f` would eat the line.

Chords must be listed before any single-key manipulator that uses one of their
keys, and three-key chords before two-key ones. Karabiner takes the first match.

## First run on the device

Three things cannot be checked without the hardware, and the first one decides
whether anything works at all. Do them in this order.

### 1. Does Karabiner report macSKK's `input_mode_id`?

All 485 manipulators are gated on
`^net\.mtgto\.inputmethod\.macSKK\.(hiragana|katakana|hankaku)$`. macSKK
registers five separate `TISInputSourceID`s and switches them via
`selectInputMode:`, but that does not prove Karabiner surfaces them in the
`input_mode_id` field. If it reports only `input_source_id` and leaves
`input_mode_id` empty, **every condition fails and the layer is a complete
no-op** — nothing happens at all, rather than something subtly wrong.

Open Karabiner-EventViewer, switch macSKK to ひらがな, and read the input source
panel. It has to print `net.mtgto.inputmethod.macSKK.hiragana` as the input
mode, not just the bundle id.

**Fallback if it does not:** gate on a variable instead. v18 already assigns
IME ON to `h`+`j` and IME OFF to `f`+`g`; make those set `naginata` to 1 / 0 and
send macSKK's `⌃J` / `l`, then swap `kanaModeCondition` in `karabiner.nix` for a
`variable_if` on `naginata`. Do not switch modes with Karabiner's
`select_input_source` action — switching into an input source that has an
`input_mode_id` is documented as unreliable on macOS.

### 2. Does Shift+space type 　 or start ▽?

```nix
to_if_alone = [ { key_code = "z"; } { key_code = "spacebar"; repeat = false; } ];
```

Mandatory modifiers are documented as removed from `to` events, but the docs do
not say whether that extends to `to_if_alone`. If it does not, macSKK receives an
uppercase `Z`, which **starts ▽ with a pending `z`** and then converts a garbage
buffer. That is a mode change, not a wrong character, and neither the linter nor
`verify-karabiner.py` can see it.

Press Shift+space first thing after granting permissions.

**Fallback:** move the full-width space to `q`+space. `q` has no kana on either
plane, so the chord is free, and it needs no macSKK configuration either.

### 3. Is macSKK's plain Space half-width or full-width?

Half-width is wanted. macSKK has **no setting** for this — nothing in its
localised strings or changelog — and Karabiner cannot fix it, because only
macSKK knows whether the buffer is empty (insert a space) or in ▽ (convert). The
stock table's `z ,　` row for the full-width space implies the plain space is
half-width, and SKK convention agrees, but it is unverified.

If it turns out full-width, that requirement is unmet and needs raising, not
patching around.

## References

- Naginata-shiki: <http://oookaworks.seesaa.net/category/26654024-1.html>
- macSKK: <https://github.com/mtgto/macSKK>
- Karabiner-Elements JSON reference:
  <https://karabiner-elements.pqrs.org/docs/json/>
