# macSKK + yaskkserv2 Hybrid Configuration

This directory contains the Nix configuration for:
- **macSKK**: A Japanese SKK (Simple Kana to Kanji conversion) input method for macOS
- **yaskkserv2**: A high-performance SKK server with Google Japanese Input API support

## What is SKK?

SKK is a Japanese input method that uses a unique conversion strategy: you type in a special way that indicates where kanji conversion should happen, making it very efficient for touch typists.

## Hybrid Configuration Approach

This configuration uses a **hybrid approach** for optimal performance:

1. **macSKK**: Reads dictionaries **directly from files** (fast local lookups)
2. **yaskkserv2**: Provides **Google Japanese Input API fallback** (for unknown words)
3. **Combined**: File dictionaries first, then Google API for unknown words

### Why Hybrid?

- ✅ Fast local dictionary lookups (no server overhead for known words)
- ✅ Google API fallback for unknown/new words (names, technical terms, slang)
- ✅ No unnecessary dictionary merging or duplication
- ✅ Simple and efficient architecture

## What is yaskkserv2?

yaskkserv2 is a Rust-based SKK server that:
- Serves SKK dictionary lookups over TCP (port 1178)
- Provides Google Japanese Input API integration for unknown words
- Caches Google API results for better performance
- Supports UTF-8 and EUC-JP encodings

**In this configuration**: yaskkserv2 uses an empty dictionary and serves only as a Google API proxy.

## Setup Steps

### 1. Fully Automated Setup via Home Manager

Everything is **automatically configured** when you run:

```bash
home-manager switch --flake .#karunon@macos-arm  # Apple Silicon
```

This will **automatically**:
- ✅ Install macSKK and yaskkserv2
- ✅ Download SKK dictionaries to macSKK's directory:
  - SKK-JISYO.L (large dictionary - base)
  - SKK-JISYO.jinmei (person names)
  - SKK-JISYO.geo (geographical names)
  - SKK-JISYO.station (station names)
  - SKK-JISYO.propernoun (proper nouns)
  - SKK-JISYO.zipcode (postal codes)
  - SKK-JISYO.lisp (Lisp/programming terms)
  - SKK-JISYO.JIS2004 (JIS2004 kanji)
  - SKK-JISYO.JIS3_4 (JIS level 3&4 kanji)
  - SKK-JISYO.JIS2 (JIS level 2 kanji)
  - SKK-JISYO.itaiji.JIS3_4 (variant kanji JIS3&4)
  - SKK-JISYO.itaiji (variant kanji)
  - SKK-JISYO.fullname (full names)
  - SKK-JISYO.edict (English-Japanese dictionary)
- ✅ Create empty dictionary for yaskkserv2 (Google API only mode)
- ✅ Configure yaskkserv2 to auto-start on login

**No manual dictionary setup required!** The first run may take a few minutes to download all dictionaries.

### 2. Verify yaskkserv2 Service (Optional)

The service should auto-start on login. To verify it's running:

```bash
launchctl list | grep yaskkserv2
netstat -an | grep 1178  # Should show port 1178 listening
```

If not running, manually start it:

```bash
launchctl load ~/Library/LaunchAgents/org.nix-community.home.yaskkserv2.plist
```

### 3. Install the macSKK Input Method App

macSKK needs to be installed in the Input Methods directory. Run:

```bash
sudo cp -R ~/.nix-profile/Applications/macSKK.app /Library/Input\ Methods/
```

Or for user-level installation (no sudo needed):

```bash
cp -R ~/.nix-profile/Applications/macSKK.app ~/Library/Input\ Methods/
```

### 4. Enable macSKK in System Settings

1. Open **System Settings** > **Keyboard** > **Input Sources**
2. Click the **+** button
3. Find and add **macSKK** from the list
4. macSKK should now appear in your input source menu

### 5. Configure macSKK (Hybrid Mode)

1. Open macSKK preferences (click the input source icon and select Preferences)

2. **Dictionaries Tab**:
   - File dictionaries should be auto-detected from the Dictionaries folder
   - Verify that the downloaded dictionaries are listed

3. **Server Tab**:
   - Enable **Use SKK server**
   - Set server to: `localhost` port: `1178`
   - Click **Apply**

Now macSKK will use:
1. **File dictionaries first** (fast local lookups)
2. **yaskkserv2** (Google Japanese Input API) for unknown words

This hybrid approach provides the best performance and coverage!

## Configuration Files

### macSKK

macSKK stores its configuration in:
```
~/Library/Containers/net.mtgto.inputmethod.macSKK/Data/Library/Preferences/net.mtgto.inputmethod.macSKK.plist
```

### macSKK Dictionaries

SKK dictionaries for macSKK are stored in:
```
~/Library/Containers/net.mtgto.inputmethod.macSKK/Data/Documents/Dictionaries/
├── SKK-JISYO.L                  # Large dictionary (EUC-JP)
├── SKK-JISYO.jinmei            # Person names
├── SKK-JISYO.geo               # Geographical names
├── SKK-JISYO.station           # Station names
├── SKK-JISYO.propernoun        # Proper nouns
├── SKK-JISYO.zipcode           # Postal codes
├── SKK-JISYO.lisp              # Lisp/programming terms
├── SKK-JISYO.JIS2004           # JIS2004 kanji
├── SKK-JISYO.JIS3_4            # JIS level 3&4 kanji
├── SKK-JISYO.JIS2              # JIS level 2 kanji
├── SKK-JISYO.itaiji.JIS3_4     # Variant kanji JIS3&4
├── SKK-JISYO.itaiji            # Variant kanji
├── SKK-JISYO.fullname          # Full names
└── SKK-JISYO.edict             # English-Japanese dictionary
```

### yaskkserv2

yaskkserv2 files are stored in:
```
~/.local/share/yaskkserv2/
├── SKK-JISYO.empty             # Empty dictionary source
├── dictionary.yaskkserv2        # Empty dictionary (Google API only mode)
├── google-cache.json            # Google API cache
├── yaskkserv2.out.log          # stdout log
└── yaskkserv2.err.log          # stderr log
```

### launchd Service

The yaskkserv2 service is configured via:
```
~/Library/LaunchAgents/org.nix-community.home.yaskkserv2.plist
```

Service settings:
- **Port**: 1178 (SKK protocol default)
- **Dictionary**: Empty (Google API only mode)
- **Google Japanese Input**: `notfound` mode (queries API for all requests since dictionary is empty)
- **Google Suggest**: Enabled
- **Auto-start**: Enabled (runs on login)

**Note**: In this hybrid configuration, yaskkserv2 acts purely as a Google API proxy since macSKK handles local dictionary lookups.

## Basic Usage

- **Switch to SKK mode**: Select macSKK from the input source menu
- **Hiragana input**: Type normally in lowercase
- **Kanji conversion**: Type the reading with the first character in uppercase (Shift key)
  - Example: `Kanzi` + Space → converts to kanji options
- **Cancel conversion**: Press `x` during conversion

Refer to the [official macSKK documentation](https://github.com/mtgto/macSKK) for detailed usage instructions.

## Updating

When you update your Home Manager configuration, both macSKK and yaskkserv2 will be updated automatically.

### Update macSKK App

After updating, copy the new app to the Input Methods directory:

```bash
sudo cp -R ~/.nix-profile/Applications/macSKK.app /Library/Input\ Methods/
```

### Restart yaskkserv2 Service

After updating yaskkserv2, restart the service:

```bash
launchctl unload ~/Library/LaunchAgents/org.nix-community.home.yaskkserv2.plist
launchctl load ~/Library/LaunchAgents/org.nix-community.home.yaskkserv2.plist
```

Or simply:

```bash
launchctl kickstart -k gui/$(id -u)/org.nix-community.home.yaskkserv2
```

### Update Dictionaries

To update the SKK dictionaries to the latest version:

```bash
rm ~/Library/Containers/net.mtgto.inputmethod.macSKK/Data/Documents/Dictionaries/SKK-JISYO.*
home-manager switch --flake .#karunon@macos-arm
```

The activation script will automatically re-download the dictionaries. No need to restart yaskkserv2 since dictionaries are read directly by macSKK.

## Troubleshooting

### yaskkserv2 not starting

Check if the service is running:

```bash
launchctl list | grep yaskkserv2
```

Check the logs:

```bash
tail -f ~/.local/share/yaskkserv2/yaskkserv2.err.log
tail -f ~/.local/share/yaskkserv2/yaskkserv2.out.log
```

Common issues:
- **Dictionary not found**: Re-run `home-manager switch` to regenerate dictionaries
- **Port already in use**: Check if another process is using port 1178: `lsof -i :1178`

### macSKK cannot connect to server

1. Verify yaskkserv2 is running: `netstat -an | grep 1178`
2. Check macSKK server settings: `localhost:1178`
3. Restart yaskkserv2 service (see Updating section)

### Input method not appearing in System Settings

- Make sure the app is correctly installed to `/Library/Input Methods/` or `~/Library/Input Methods/`
- Try logging out and logging back in
- Check Console.app for any error messages related to macSKK

### Conversion not working or getting strange results

1. Check yaskkserv2 logs for errors
2. Try clearing the Google API cache:
   ```bash
   rm ~/.local/share/yaskkserv2/google-cache.json
   launchctl kickstart -k gui/$(id -u)/org.nix-community.home.yaskkserv2
   ```
3. Rebuild macSKK dictionaries:
   ```bash
   rm ~/Library/Containers/net.mtgto.inputmethod.macSKK/Data/Documents/Dictionaries/SKK-JISYO.*
   home-manager switch --flake .#karunon@macos-arm
   ```

### Disable Google API (use local dictionaries only)

If you want to use only local dictionaries without Google API:

1. Disable SKKServ in macSKK preferences (or stop yaskkserv2 service):
   ```bash
   launchctl unload ~/Library/LaunchAgents/org.nix-community.home.yaskkserv2.plist
   ```

2. macSKK will continue to work with file dictionaries only

Alternatively, to keep yaskkserv2 running but disable Google API, edit `macSKK/default.nix` and change:

```nix
"--google-japanese-input=notfound"
```

to:

```nix
"--google-japanese-input=disable"
```

Then run `home-manager switch` and restart the service.
