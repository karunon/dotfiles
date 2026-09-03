{ pkgs, lib, config, ... }:

let
  karabiner = import ./karabiner.nix { inherit lib; };

  # The complex_modifications asset, in the format karabiner_cli can lint.
  assetFile = pkgs.writeText "naginata-v18.json" (builtins.toJSON {
    title = "Naginata-shiki v18";
    rules = [ karabiner.rule ];
  });

  # Just the one rule object, for the surgical jq patch below.
  ruleFile = pkgs.writeText "naginata-v18-rule.json"
    (builtins.toJSON karabiner.rule);

  # Used only when Karabiner has never been configured on this machine.
  seedFile = pkgs.writeText "karabiner-seed.json" (builtins.toJSON {
    global.show_in_menu_bar = true;
    profiles = [{
      name = "Default profile";
      selected = true;
      complex_modifications.rules = [ ];
    }];
  });

  # macSKK 2.10.0 and later picks up any Settings/kana-rule*.conf and offers
  # them in a dropdown, so this file lives alongside the AZIK rule the macSKK
  # module writes rather than fighting it for the same path.
  stockKanaRule =
    "${pkgs.macskk}/Library/Input Methods/macSKK.app/Contents/Resources/kana-rule.conf";

  karabinerDir = "${config.home.homeDirectory}/.config/karabiner";
  macSKKSettingsDir =
    "${config.home.homeDirectory}/Library/Containers/net.mtgto.inputmethod.macSKK/Data/Documents/Settings";

  manipulatorCount = toString karabiner.stats.total;
in
{
  home.activation.naginataSetup = lib.mkIf pkgs.stdenv.isDarwin (
    lib.hm.dag.entryAfter [ "writeBoundary" ] ''
      KARABINER_JSON="${karabinerDir}/karabiner.json"
      ASSET_DIR="${karabinerDir}/assets/complex_modifications"
      SETTINGS_DIR="${macSKKSettingsDir}"

      $DRY_RUN_CMD ${pkgs.coreutils}/bin/mkdir -p "$ASSET_DIR"
      $DRY_RUN_CMD ${pkgs.coreutils}/bin/mkdir -p "$SETTINGS_DIR"

      # Drop the asset in as well, so the rule can be inspected or re-enabled
      # from Karabiner's own UI.
      $DRY_RUN_CMD ${pkgs.coreutils}/bin/install -m 644 \
        ${assetFile} "$ASSET_DIR/naginata-v18.json"

      if [ ! -f "$KARABINER_JSON" ]; then
        $DRY_RUN_CMD ${pkgs.coreutils}/bin/install -m 644 \
          ${seedFile} "$KARABINER_JSON"
      fi

      # Replace only our own rule, matched on its description, leaving every
      # other rule and setting in karabiner.json alone. Enabling a rule in the
      # UI copies it into karabiner.json, so editing the asset by itself would
      # never reach a rule that has already been enabled.
      #
      # The redirects below are guarded on DRY_RUN rather than prefixed with the
      # deprecated $DRY_RUN_CMD: `echo cmd > file` still truncates the file and
      # writes the echoed command line into it.
      if [[ -v DRY_RUN ]]; then
        echo "would patch $KARABINER_JSON with rule ${karabiner.description}"
        echo "would write $SETTINGS_DIR/kana-rule-naginata.conf"
      else
        ${pkgs.jq}/bin/jq \
          --slurpfile rule ${ruleFile} \
          '.profiles |= map(
             .complex_modifications.rules =
               (((.complex_modifications.rules // [])
                 | map(select(.description != $rule[0].description)))
                + [$rule[0]])
           )' \
          "$KARABINER_JSON" > "$KARABINER_JSON.naginata-tmp" \
          && ${pkgs.coreutils}/bin/mv \
               "$KARABINER_JSON.naginata-tmp" "$KARABINER_JSON"

        # Naginata's kana rule: stock table + the ？ / ！ rows.
        ${pkgs.coreutils}/bin/cat \
          "${stockKanaRule}" ${./kana-rule-extra.conf} \
          > "$SETTINGS_DIR/kana-rule-naginata.conf"
      fi

      $DRY_RUN_CMD echo ""
      $DRY_RUN_CMD echo "================================================"
      $DRY_RUN_CMD echo "Naginata-shiki v18"
      $DRY_RUN_CMD echo "================================================"
      $DRY_RUN_CMD echo "OK  Karabiner rule installed (${manipulatorCount} manipulators)"
      $DRY_RUN_CMD echo "OK  kana-rule-naginata.conf written"
      $DRY_RUN_CMD echo ""
      $DRY_RUN_CMD echo "Manual steps:"
      $DRY_RUN_CMD echo "1. Launch Karabiner-Elements once and grant Input"
      $DRY_RUN_CMD echo "   Monitoring plus the driver extension."
      $DRY_RUN_CMD echo "2. System Settings > Keyboard > Input Sources:"
      $DRY_RUN_CMD echo "   add macSKK if it is not enabled yet."
      $DRY_RUN_CMD echo "3. macSKK Settings > kana rule: select"
      $DRY_RUN_CMD echo "   kana-rule-naginata. Do NOT use the AZIK rule:"
      $DRY_RUN_CMD echo "   31 sequences break under it (naginata/README.md)."
      $DRY_RUN_CMD echo ""
      $DRY_RUN_CMD echo "Nix owns the rule named:"
      $DRY_RUN_CMD echo "  ${karabiner.description}"
      $DRY_RUN_CMD echo "Disabling it in the Karabiner UI is undone by the next"
      $DRY_RUN_CMD echo "home-manager switch."
      $DRY_RUN_CMD echo "================================================"
      $DRY_RUN_CMD echo ""
    ''
  );
}
