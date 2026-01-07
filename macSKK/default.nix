{ pkgs, lib, config, ... }:

let
  yaskkserv2 = pkgs.callPackage ./yaskkserv2.nix { };
in
{
  # Install macSKK and yaskkserv2 packages (macOS only)
  home.packages = lib.optionals pkgs.stdenv.isDarwin [
    pkgs.macskk
    yaskkserv2
  ];

  # Create helper script to download and setup SKK dictionary for yaskkserv2
  home.file.".local/bin/setup-yaskkserv2-dict" = lib.mkIf pkgs.stdenv.isDarwin {
    executable = true;
    text = ''
      #!/usr/bin/env bash
      set -euo pipefail

      YASKKSERV2_DIR="$HOME/.local/share/yaskkserv2"
      SKK_JISYO_URL="https://raw.githubusercontent.com/skk-dev/dict/master/SKK-JISYO.L"

      echo "Setting up yaskkserv2 dictionaries..."

      # Create dictionary directory if it doesn't exist
      mkdir -p "$YASKKSERV2_DIR"

      # Download SKK-JISYO.L if not already present
      if [ ! -f "$YASKKSERV2_DIR/SKK-JISYO.L" ]; then
        echo "Downloading SKK-JISYO.L..."
        curl -L "$SKK_JISYO_URL" -o "$YASKKSERV2_DIR/SKK-JISYO.L"
        echo "Dictionary downloaded to $YASKKSERV2_DIR/SKK-JISYO.L"
      else
        echo "SKK-JISYO.L already exists at $YASKKSERV2_DIR/SKK-JISYO.L"
      fi

      # Convert dictionary to yaskkserv2 format
      echo "Converting dictionary to yaskkserv2 format..."
      ${yaskkserv2}/bin/yaskkserv2_make_dictionary \
        "$YASKKSERV2_DIR/SKK-JISYO.L" \
        "$YASKKSERV2_DIR/dictionary.yaskkserv2"

      echo ""
      echo "yaskkserv2 dictionary setup complete!"
      echo "Dictionary location: $YASKKSERV2_DIR/dictionary.yaskkserv2"
    '';
  };

  # launchd service for yaskkserv2
  launchd.agents.yaskkserv2 = lib.mkIf pkgs.stdenv.isDarwin {
    enable = true;
    config = {
      ProgramArguments = [
        "${yaskkserv2}/bin/yaskkserv2"
        "--google-japanese-input=notfound"
        "--google-suggest"
        "--google-cache-filename=${config.home.homeDirectory}/.local/share/yaskkserv2/google-cache.json"
        "${config.home.homeDirectory}/.local/share/yaskkserv2/dictionary.yaskkserv2"
      ];
      KeepAlive = true;
      RunAtLoad = true;
      StandardErrorPath = "${config.home.homeDirectory}/.local/share/yaskkserv2/yaskkserv2.err.log";
      StandardOutPath = "${config.home.homeDirectory}/.local/share/yaskkserv2/yaskkserv2.out.log";
    };
  };

  # Create activation script to remind user about manual steps
  home.activation.macSKKSetup = lib.mkIf pkgs.stdenv.isDarwin (
    lib.hm.dag.entryAfter [ "writeBoundary" ] ''
      $DRY_RUN_CMD echo ""
      $DRY_RUN_CMD echo "================================================"
      $DRY_RUN_CMD echo "macSKK + yaskkserv2 Installation Notice"
      $DRY_RUN_CMD echo "================================================"
      $DRY_RUN_CMD echo "macSKK and yaskkserv2 have been installed."
      $DRY_RUN_CMD echo ""
      $DRY_RUN_CMD echo "Setup steps:"
      $DRY_RUN_CMD echo "1. Run: setup-yaskkserv2-dict"
      $DRY_RUN_CMD echo "   This downloads and converts the SKK dictionary"
      $DRY_RUN_CMD echo ""
      $DRY_RUN_CMD echo "2. Start yaskkserv2 service:"
      $DRY_RUN_CMD echo "   launchctl load ~/Library/LaunchAgents/org.nix-community.home.yaskkserv2.plist"
      $DRY_RUN_CMD echo ""
      $DRY_RUN_CMD echo "3. Install macSKK Input Method:"
      $DRY_RUN_CMD echo "   sudo cp -R ${pkgs.macskk}/Applications/macSKK.app /Library/Input\ Methods/"
      $DRY_RUN_CMD echo ""
      $DRY_RUN_CMD echo "4. Enable in System Settings:"
      $DRY_RUN_CMD echo "   System Settings > Keyboard > Input Sources > Add macSKK"
      $DRY_RUN_CMD echo ""
      $DRY_RUN_CMD echo "5. Configure macSKK to use SKKServ:"
      $DRY_RUN_CMD echo "   macSKK Preferences > Server > localhost:1178"
      $DRY_RUN_CMD echo ""
      $DRY_RUN_CMD echo "yaskkserv2 will use Google Japanese Input API for unknown words."
      $DRY_RUN_CMD echo "================================================"
      $DRY_RUN_CMD echo ""
    ''
  );
}
