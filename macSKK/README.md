# macSKK + yaskkserv2 Configuration

This directory contains the Nix configuration for:
- **macSKK**: A Japanese SKK (Simple Kana to Kanji conversion) input method for macOS
- **yaskkserv2**: A high-performance SKK server with Google Japanese Input API support

## What is SKK?

SKK is a Japanese input method that uses a unique conversion strategy: you type in a special way that indicates where kanji conversion should happen, making it very efficient for touch typists.

## What is yaskkserv2?

yaskkserv2 is a Rust-based SKK server that:
- Serves SKK dictionary lookups over TCP (port 1178)
- Falls back to Google Japanese Input API for unknown words
- Caches Google API results for better performance
- Supports UTF-8 and EUC-JP encodings

## Setup Steps

### 1. Install via Home Manager

Both macSKK and yaskkserv2 are automatically installed when you run:

```bash
home-manager switch --flake .#karunon@macos-arm  # Apple Silicon
```

### 2. Setup yaskkserv2 Dictionary

Run the provided helper script to download and convert the SKK dictionary:

```bash
setup-yaskkserv2-dict
```

This will:
- Download SKK-JISYO.L (the standard SKK dictionary)
- Convert it to yaskkserv2's optimized binary format
- Save to `~/.local/share/yaskkserv2/dictionary.yaskkserv2`

### 3. Start yaskkserv2 Service

Start the yaskkserv2 background service:

```bash
launchctl load ~/Library/LaunchAgents/org.nix-community.home.yaskkserv2.plist
```

To check if it's running:

```bash
launchctl list | grep yaskkserv2
netstat -an | grep 1178  # Should show port 1178 listening
```

### 4. Install the macSKK Input Method App

macSKK needs to be installed in the Input Methods directory. Run:

```bash
sudo cp -R ~/.nix-profile/Applications/macSKK.app /Library/Input\ Methods/
```

Or for user-level installation (no sudo needed):

```bash
cp -R ~/.nix-profile/Applications/macSKK.app ~/Library/Input\ Methods/
```

### 5. Enable macSKK in System Settings

1. Open **System Settings** > **Keyboard** > **Input Sources**
2. Click the **+** button
3. Find and add **macSKK** from the list
4. macSKK should now appear in your input source menu

### 6. Configure macSKK to Use SKKServ

1. Open macSKK preferences (click the input source icon and select Preferences)
2. Go to the **Server** tab
3. Enable **Use SKK server**
4. Set server to: `localhost` port: `1178`
5. Click **Apply**

Now macSKK will use yaskkserv2 for dictionary lookups, with automatic fallback to Google Japanese Input API for unknown words!

## Configuration Files

### macSKK

macSKK stores its configuration in:
```
~/Library/Containers/net.mtgto.inputmethod.macSKK/Data/Library/Preferences/net.mtgto.inputmethod.macSKK.plist
```

### yaskkserv2

yaskkserv2 files are stored in:
```
~/.local/share/yaskkserv2/
├── SKK-JISYO.L                  # Original dictionary (EUC-JP)
├── dictionary.yaskkserv2        # Converted binary dictionary
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
- **Google Japanese Input**: `notfound` mode (only queries API when dictionary has no match)
- **Google Suggest**: Enabled
- **Auto-start**: Enabled (runs on login)

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

### Update Dictionary

To update the SKK dictionary to the latest version:

```bash
rm ~/.local/share/yaskkserv2/SKK-JISYO.L
setup-yaskkserv2-dict
```

Then restart yaskkserv2 service.

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
- **Dictionary not found**: Run `setup-yaskkserv2-dict` first
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
3. Rebuild the dictionary:
   ```bash
   rm ~/.local/share/yaskkserv2/dictionary.yaskkserv2
   setup-yaskkserv2-dict
   ```

### Disable Google API (use local dictionary only)

Edit `macSKK/default.nix` and change:

```nix
"--google-japanese-input=notfound"
```

to:

```nix
"--google-japanese-input=disable"
```

Then run `home-manager switch` and restart the service.
