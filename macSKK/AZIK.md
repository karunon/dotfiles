# macSKK AZIK notes

This repository generates macSKK's `kana-rule.conf` from:

1. macSKK default `kana-rule.conf`
2. [`azik-overrides.conf`](./azik-overrides.conf)

The generated file is written to:

`~/Library/Containers/net.mtgto.inputmethod.macSKK/Data/Documents/Settings/kana-rule.conf`

## Current compromise

This first draft keeps the existing SKK-style single-key behavior:

- `q`: katakana toggle
- `l`: abbrev/direct input key

Because of that, the following AZIK entries are intentionally not defined yet:

- `q,ん`
- `la/li/lu/le/lo`
- `lya/lyu/lyo`
- `lz/ln/lk/ld/ll`
- `lyz/lyn/lyj/lyl`
- `lq/lh/lw/lp`
- `lyq/lyh/lyp`

If suffix forms such as `kq`, `kl`, `syq`, `syl` also turn out to conflict in
actual use, the next step is to remove all `*q` and/or `*l` AZIK families and
replace them with alternative strokes.
