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

  # Automatic setup on home-manager activation
  home.activation.macSKKSetup = lib.mkIf pkgs.stdenv.isDarwin (
    lib.hm.dag.entryAfter [ "writeBoundary" ] ''
      MACSKK_DICT_DIR="$HOME/Library/Containers/net.mtgto.inputmethod.macSKK/Data/Documents/Dictionaries"
      YASKKSERV2_DIR="$HOME/.local/share/yaskkserv2"
      SKK_DICT_BASE_URL="https://raw.githubusercontent.com/skk-dev/dict/master"

      # Create directories
      $DRY_RUN_CMD mkdir -p "$MACSKK_DICT_DIR"
      $DRY_RUN_CMD mkdir -p "$YASKKSERV2_DIR"

      # Download dictionaries for macSKK (if not already present)
      # Format: "filename:url_path"
      declare -a DICTIONARIES=(
        "SKK-JISYO.L:SKK-JISYO.L"
        "SKK-JISYO.jinmei:SKK-JISYO.jinmei"
        "SKK-JISYO.geo:SKK-JISYO.geo"
        "SKK-JISYO.station:SKK-JISYO.station"
        "SKK-JISYO.propernoun:SKK-JISYO.propernoun"
        "SKK-JISYO.zipcode:zipcode/SKK-JISYO.zipcode"
        "SKK-JISYO.lisp:SKK-JISYO.lisp"
        "SKK-JISYO.JIS2004:SKK-JISYO.JIS2004"
        "SKK-JISYO.JIS3_4:SKK-JISYO.JIS3_4"
        "SKK-JISYO.JIS2:SKK-JISYO.JIS2"
        "SKK-JISYO.itaiji.JIS3_4:SKK-JISYO.itaiji.JIS3_4"
        "SKK-JISYO.itaiji:SKK-JISYO.itaiji"
        "SKK-JISYO.fullname:SKK-JISYO.fullname"
        "SKK-JISYO.edict:SKK-JISYO.edict"
      )

      for entry in "''${DICTIONARIES[@]}"; do
        filename="''${entry%%:*}"
        urlpath="''${entry#*:}"
        if [ ! -f "$MACSKK_DICT_DIR/$filename" ]; then
          $DRY_RUN_CMD echo "Downloading $filename..."
          $DRY_RUN_CMD ${pkgs.curl}/bin/curl -fsSL "$SKK_DICT_BASE_URL/$urlpath" -o "$MACSKK_DICT_DIR/$filename"
        fi
      done

      # Create empty dictionary for yaskkserv2 (if not already present)
      if [ ! -f "$YASKKSERV2_DIR/dictionary.yaskkserv2" ]; then
        $DRY_RUN_CMD cat > "$YASKKSERV2_DIR/SKK-JISYO.empty" << 'EOF'
;; okuri-ari entries.
;; okuri-nasi entries.
EOF
        $DRY_RUN_CMD ${yaskkserv2}/bin/yaskkserv2_make_dictionary \
          --dictionary-filename="$YASKKSERV2_DIR/dictionary.yaskkserv2" \
          "$YASKKSERV2_DIR/SKK-JISYO.empty"
      fi

      # Display setup notice
      $DRY_RUN_CMD echo ""
      $DRY_RUN_CMD echo "================================================"
      $DRY_RUN_CMD echo "macSKK + yaskkserv2 Hybrid Configuration"
      $DRY_RUN_CMD echo "================================================"
      $DRY_RUN_CMD echo "✅ SKK dictionaries downloaded to macSKK"
      $DRY_RUN_CMD echo "✅ yaskkserv2 empty dictionary created"
      $DRY_RUN_CMD echo "✅ yaskkserv2 service configured (auto-start on login)"
      $DRY_RUN_CMD echo ""
      $DRY_RUN_CMD echo "Manual steps required:"
      $DRY_RUN_CMD echo "1. Install macSKK Input Method:"
      $DRY_RUN_CMD echo "   sudo cp -R ${pkgs.macskk}/Applications/macSKK.app /Library/Input\ Methods/"
      $DRY_RUN_CMD echo ""
      $DRY_RUN_CMD echo "2. Enable in System Settings:"
      $DRY_RUN_CMD echo "   System Settings > Keyboard > Input Sources > Add macSKK"
      $DRY_RUN_CMD echo ""
      $DRY_RUN_CMD echo "3. Configure macSKK:"
      $DRY_RUN_CMD echo "   - File dictionaries: Auto-detected ✅"
      $DRY_RUN_CMD echo "   - SKKServ: localhost:1178 (for Google API fallback)"
      $DRY_RUN_CMD echo ""
      $DRY_RUN_CMD echo "Hybrid mode: File dictionaries first, then Google API"
      $DRY_RUN_CMD echo "================================================"
      $DRY_RUN_CMD echo ""
    ''
  );
}
