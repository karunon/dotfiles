# Claude Code Guide for macSKK

This directory contains the Nix configuration for macSKK (Japanese SKK input method) and yaskkserv2 (SKK server with Google Japanese Input API support).

## Overview

**macSKK** is a Japanese SKK (Simple Kana to Kanji conversion) input method for macOS that uses a unique hybrid configuration:

1. **Local file dictionaries** (14 dictionaries) for fast lookups
2. **yaskkserv2 server** (localhost:1178) with Google Japanese Input API for fallback

This hybrid approach provides:
- Fast local dictionary lookups (no server overhead)
- Google API fallback for unknown words (names, technical terms, slang)
- Automatic dictionary updates via Home Manager

## File Structure

```
macSKK/
├── default.nix           # Home Manager integration (main config)
├── yaskkserv2.nix        # yaskkserv2 package definition
├── README.md             # User-facing setup guide
└── CLAUDE.md             # This file (Claude Code guide)
```

## Configuration Architecture

### default.nix

This file handles:
- Package installation (macSKK + yaskkserv2) - macOS only
- launchd service for yaskkserv2 (auto-start on login)
- Activation script that:
  - Downloads 14 SKK dictionaries to macSKK's directory
  - Creates empty dictionary for yaskkserv2 (Google API only mode)
  - Displays setup instructions to user

### yaskkserv2.nix

Custom Nix package definition for yaskkserv2 (Rust-based SKK server).

## Dictionary Configuration

### macSKK Dictionaries (14 dictionaries)

Stored in: `~/Library/Containers/net.mtgto.inputmethod.macSKK/Data/Documents/Dictionaries/`

**Load order** (optimized for minimal conversion stress):

1. **SKK-JISYO.L** - Base dictionary (essential)
2. **SKK-JISYO.jinmei** - Person names (daily use)
3. **SKK-JISYO.propernoun** - Proper nouns (companies, brands)
4. **SKK-JISYO.geo** - Geographical names
5. **SKK-JISYO.station** - Station names
6. **SKK-JISYO.fullname** - Full names
7. **SKK-JISYO.lisp** - Useful features (date conversion, etc.)
8. **SKK-JISYO.zipcode** - Postal codes
9. **SKK-JISYO.JIS2004** - JIS2004 additional kanji
10. **SKK-JISYO.JIS2** - JIS level 2 kanji
11. **SKK-JISYO.JIS3_4** - JIS level 3&4 kanji (specialized)
12. **SKK-JISYO.itaiji** - Variant kanji
13. **SKK-JISYO.itaiji.JIS3_4** - Variant kanji (JIS3&4)
14. **SKK-JISYO.edict** - English-Japanese (abbrev mode)

**Important**: Dictionary load order is determined by file modification time (mtime). The activation script adds 1-second delays between downloads to ensure correct ordering.

### yaskkserv2 Configuration

Stored in: `~/.local/share/yaskkserv2/`

- **Dictionary**: Empty (Google API only mode)
- **Google Japanese Input**: `notfound` mode (queries API for all requests)
- **Google Suggest**: Enabled
- **Cache**: `google-cache.json` (persistent cache of API results)
- **Port**: 1178 (SKK protocol default)

## Common Tasks

### Adding a New Dictionary

1. Add the dictionary to the `DICTIONARIES` array in `default.nix`:
   ```nix
   declare -a DICTIONARIES=(
     # ... existing dictionaries ...
     "SKK-JISYO.newdict:path/to/SKK-JISYO.newdict"  # Add here
   )
   ```

2. Position in array determines load order (earlier = higher priority)

3. Run `home-manager switch --flake .#karunon@macos-arm`

### Removing a Dictionary

1. Remove the entry from the `DICTIONARIES` array in `default.nix`
2. Run `home-manager switch --flake .#karunon@macos-arm`
3. Manually delete the file from `~/Library/Containers/net.mtgto.inputmethod.macSKK/Data/Documents/Dictionaries/` if needed

### Changing Dictionary Load Order

1. Reorder entries in the `DICTIONARIES` array (earlier = higher priority)
2. **Important**: Delete existing dictionaries to force re-download with new timestamps:
   ```bash
   rm ~/Library/Containers/net.mtgto.inputmethod.macSKK/Data/Documents/Dictionaries/SKK-JISYO.*
   ```
3. Run `home-manager switch --flake .#karunon@macos-arm`

### Disabling Google API

To use only local dictionaries without Google API:

**Option 1**: Change yaskkserv2 Google mode:
```nix
"--google-japanese-input=disable"  # Change from "notfound"
```

**Option 2**: Disable the entire yaskkserv2 service:
```nix
launchd.agents.yaskkserv2.enable = false;
```

### Updating yaskkserv2 Version

Edit `yaskkserv2.nix` and change the version/hash, then run:
```bash
home-manager switch --flake .#karunon@macos-arm
launchctl kickstart -k gui/$(id -u)/org.nix-community.home.yaskkserv2
```

## Platform-Specific Behavior

All configuration is **macOS-only**:
- Uses `lib.optionals pkgs.stdenv.isDarwin`
- Uses `lib.mkIf pkgs.stdenv.isDarwin`
- launchd service is macOS-specific
- macSKK app installation requires macOS Input Methods directory

## Important Notes

### Home Manager Activation Script

The activation script (`home.activation.macSKKSetup`) runs automatically on every `home-manager switch`:
- Only downloads dictionaries if they don't already exist (idempotent)
- Uses `$DRY_RUN_CMD` prefix for all commands (respects dry-run mode)
- Uses `lib.hm.dag.entryAfter [ "writeBoundary" ]` to ensure proper ordering

### Manual Steps Required

After Home Manager activation, users must:
1. Install macSKK app to Input Methods directory (requires sudo or user action)
2. Enable macSKK in System Settings (Keyboard > Input Sources)
3. Configure macSKK server settings (localhost:1178)

These cannot be automated via Nix/Home Manager due to macOS security restrictions.

### Dictionary Encoding

- **macSKK**: Supports EUC-JP and UTF-8
- **yaskkserv2**: Uses UTF-8 internally
- All dictionaries from skk-dev/dict repository are in EUC-JP format

### Service Management

yaskkserv2 runs as a user-level launchd service:
- Auto-starts on login
- Keeps alive (restarts on crash)
- Logs to `~/.local/share/yaskkserv2/*.log`

## Troubleshooting Tips for Claude Code

### If yaskkserv2 won't start:
1. Check if dictionary file exists: `~/.local/share/yaskkserv2/dictionary.yaskkserv2`
2. Check logs: `~/.local/share/yaskkserv2/yaskkserv2.err.log`
3. Verify port 1178 is not in use: `lsof -i :1178`

### If dictionaries aren't loading:
1. Check if files exist in macSKK directory
2. Verify file modification times (should be in order): `ls -lt ~/Library/Containers/net.mtgto.inputmethod.macSKK/Data/Documents/Dictionaries/`
3. Delete and re-download if timestamps are wrong

### If Google API isn't working:
1. Verify yaskkserv2 is running: `launchctl list | grep yaskkserv2`
2. Check `--google-japanese-input=notfound` is set
3. Check cache file permissions: `~/.local/share/yaskkserv2/google-cache.json`

## Integration with Parent Configuration

This module is imported in `nix/modules/home/default.nix`:
```nix
imports = [
  # ... other modules ...
  ../../macSKK  # Imports ./default.nix
];
```

Changes to this module require:
```bash
home-manager switch --flake .#karunon@macos-arm  # Apple Silicon
home-manager switch --flake .#karunon@macos-x86  # Intel
```

## References

- **macSKK**: https://github.com/mtgto/macSKK
- **yaskkserv2**: https://github.com/wachikun/yaskkserv2
- **SKK dictionaries**: https://github.com/skk-dev/dict
- **SKK input method**: https://ja.wikipedia.org/wiki/SKK
