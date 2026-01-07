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
      # Order: Optimized for minimal conversion stress (frequently used → specialized)
      declare -a DICTIONARIES=(
        "SKK-JISYO.L:SKK-JISYO.L"                      # 1. Base dictionary (essential)
        "SKK-JISYO.jinmei:SKK-JISYO.jinmei"            # 2. Person names (daily use)
        "SKK-JISYO.propernoun:SKK-JISYO.propernoun"    # 3. Proper nouns (companies, brands)
        "SKK-JISYO.geo:SKK-JISYO.geo"                  # 4. Place names
        "SKK-JISYO.station:SKK-JISYO.station"          # 5. Station names
        "SKK-JISYO.fullname:SKK-JISYO.fullname"        # 6. Full names
        "SKK-JISYO.lisp:SKK-JISYO.lisp"                # 7. Useful features (date conversion, etc.)
        "SKK-JISYO.zipcode:zipcode/SKK-JISYO.zipcode"  # 8. Postal codes
        "SKK-JISYO.JIS2004:SKK-JISYO.JIS2004"          # 9. JIS2004 additional kanji
        "SKK-JISYO.JIS2:SKK-JISYO.JIS2"                # 10. JIS level 2 kanji
        "SKK-JISYO.JIS3_4:SKK-JISYO.JIS3_4"            # 11. JIS level 3&4 kanji (specialized)
        "SKK-JISYO.itaiji:SKK-JISYO.itaiji"            # 12. Variant kanji
        "SKK-JISYO.itaiji.JIS3_4:SKK-JISYO.itaiji.JIS3_4"  # 13. Variant kanji (JIS3&4)
        "SKK-JISYO.edict:SKK-JISYO.edict"              # 14. English-Japanese (abbrev mode)
      )

      index=0
      for entry in "''${DICTIONARIES[@]}"; do
        filename="''${entry%%:*}"
        urlpath="''${entry#*:}"
        if [ ! -f "$MACSKK_DICT_DIR/$filename" ]; then
          $DRY_RUN_CMD echo "Downloading $filename..."
          if $DRY_RUN_CMD ${pkgs.curl}/bin/curl -fsSL "$SKK_DICT_BASE_URL/$urlpath" -o "$MACSKK_DICT_DIR/$filename"; then
            # Set explicit timestamp to ensure dictionary loading order
            # Base timestamp: 2020-01-01 00:00:00 + index seconds
            timestamp=$((1577836800 + index))
            $DRY_RUN_CMD touch -t $(${pkgs.coreutils}/bin/date -r $timestamp +%Y%m%d%H%M.%S) "$MACSKK_DICT_DIR/$filename"
          else
            $DRY_RUN_CMD echo "Warning: Failed to download $filename, skipping..."
          fi
        fi
        index=$((index + 1))
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
