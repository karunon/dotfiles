# macSKK AZIK notes

This repository generates macSKK's `kana-rule.conf` from:

1. macSKK default `kana-rule.conf`
2. [`azik-overrides.conf`](./azik-overrides.conf)

The generated file is written to:

`~/Library/Containers/net.mtgto.inputmethod.macSKK/Data/Documents/Settings/kana-rule.conf`

## Current conflict policy

This configuration keeps one existing SKK-style single-key behavior and moves
the abbrev/direct-input key away from AZIK's `l` prefix:

- `q`: katakana toggle
- `/`: abbrev/direct input key

Because of that, standalone `q` is intentionally not defined yet:

- `q,ん`

The `l` prefix is used for small kana and local symbol shortcuts:

- `la/li/lu/le/lo -> ぁ/ぃ/ぅ/ぇ/ぉ`
- `lya/lyu/lyo -> ゃ/ゅ/ょ`
- `lwa -> ゎ`
- `lh/lj/lk/ll -> ←/↓/↑/→`

The following AZIK `l` families are intentionally not defined because `l` is
also used as the local shortcut prefix for arrows:

- `lz/ln/lk/ld/ll`
- `lyz/lyn/lyj/lyl`
- `lq/lh/lw/lp`
- `lyq/lyh/lyp`

If suffix forms such as `kq` and `syq` also turn out to conflict in actual use,
the next step is to remove the `*q` AZIK families and replace them with
alternative strokes.

## `*w` two-vowel extensions

AZIK entries such as `kw -> けい`, `hw -> へい`, and `xw -> しぇい` share a prefix
with some of macSKK's default longer rules (`kwa`, `hwa`, `xwa`, etc.). If
those default rules remain intact, macSKK can keep the `*w` prefix pending for
an extra keystroke instead of committing the AZIK `ei` expansion.

To avoid that, the generated `kana-rule.conf` removes only the default rules
that extend an AZIK bare `*w` entry before appending `azik-overrides.conf`.

Follow-up aliases are added to keep useful non-AZIK inputs available:

- `kva/kvi/kve/kvo -> くぁ/くぃ/くぇ/くぉ`
- `gva -> ぐぁ`
- `wha -> ゎ` (replaces the dropped `xwa`)

## Other prefix conflicts

Some AZIK bare endings conflict with macSKK's default longer rules. The
generated `kana-rule.conf` drops only those default longer rules:

- `sh -> すう` drops `sha/shi/shu/she/sho`; use `si` for `し` and
  `xa/xu/xe/xo` for the sh-row.
- `th -> つう` drops `thi/thu`; use `tgi` for `てぃ`.
- `dh -> づう` drops `dhi/dhu`; use `dci/dcu` for `でぃ/どぅ`.
- `fw -> ふぇい` drops `fwu`.
