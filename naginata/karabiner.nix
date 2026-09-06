# Builds the Karabiner-Elements complex_modifications rule for Naginata-shiki
# v18 out of layout.nix. See README.md for the reasoning behind the design.
{ lib }:

let
  layout = import ./layout.nix;

  description = "Naginata-shiki v18 (kana)";

  # macSKK registers every mode as its own TISInputSourceID and switches them
  # through TIS, so gating on the kana modes tracks macSKK's own mode switching
  # with no shadow state. Under any other IME, and in macSKK's direct-input or
  # full-width-alphanumeric modes, every manipulator below is inert -- the space
  # bar included.
  kanaModeCondition = {
    type = "input_source_if";
    input_sources = [
      {
        input_mode_id =
          "^net\\.mtgto\\.inputmethod\\.macSKK\\.(hiragana|katakana|hankaku)$";
      }
    ];
  };

  shiftVar = "naginata_shift";
  shiftPlaneHeld = { type = "variable_if"; name = shiftVar; value = 1; };
  shiftPlaneFree = { type = "variable_unless"; name = shiftVar; value = 1; };

  # --- timing knobs ----------------------------------------------------------
  # Karabiner's default chord window is 50 ms, which is too tight in practice:
  # び (j+x) comes out as ひあ or あひ. Raise these if a chord splits into two
  # kana; lower them if two consecutive kana fuse into a chord.
  #
  # Both lengths share one value for now; split them again (three-key chords
  # need more time to line up three fingers than two) if a length-specific
  # window turns out to be worth the latency trade-off below.
  #
  # The cost of raising them is latency on the single-key fallback: a key that
  # takes part in a chord cannot resolve as a single until the chord window has
  # expired. Every one of the 30 keys except t and y is in some chord.
  chordThresholdMs = {
    two = 250;
    three = 250;
  };

  # Set by mkStickyShift when Shift is tapped alone; consumed by the pending-
  # shift variant of the next key that has a shifted twin. See mkStickyShift.
  pendingShiftVar = "naginata_pending_shift";
  pendingShiftHeld = { type = "variable_if"; name = pendingShiftVar; value = 1; };
  resetPendingShift = { set_variable = { name = pendingShiftVar; value = 0; }; };

  # Chords stay on the unshifted plane, matching v18, which never defines them
  # under the center shift. Allowing them while the space bar is down would make
  # two quick shift-plane kana collide with a chord: holding space and typing
  # や then め would come out as しゃ.
  chordConditions = [ kanaModeCondition shiftPlaneFree ];

  # Shift+key must start SKK's ▽ (headword) instead of typing a capital letter,
  # so each kana gets a shifted twin whose first romaji key carries the shift.
  #
  # Two exceptions, both on the unshifted plane only:
  #   semicolon (ー) -- "-" has no upper-case form and ▽ー is meaningless, so it
  #                     drops out via the isLetter test. S-; stays + in kana mode.
  #   slash     (れ) -- skipped so S-/ still reaches ?, which the kana rule maps
  #                     to ？. Nothing is lost: れ also sits on the shift plane,
  #                     so ▽れ is Shift+space+/ .
  noShiftTwinKeys = [ "slash" ];

  # --- helpers ---------------------------------------------------------------

  keyCodeOf = c: if c == "-" then "hyphen" else c;

  isLetter = c: lib.stringLength c == 1 && builtins.match "[a-z]" c != null;

  # Only the final event of a `to` array repeats while the from key is held, and
  # `repeat = false` turns that off and releases it right away. Without it,
  # holding a kana key would spray the last romaji letter -- and in Naginata you
  # hold keys constantly while waiting to complete a chord.
  toEvents = shifted: romaji:
    let
      chars = lib.stringToCharacters romaji;
      last = lib.length chars - 1;
    in
    lib.imap0
      (i: c:
        { key_code = keyCodeOf c; }
        // lib.optionalAttrs (shifted && i == 0) { modifiers = [ "left_shift" ]; }
        // lib.optionalAttrs (i == last) { repeat = false; })
      chars;

  mandatoryShift = shifted:
    lib.optionalAttrs shifted { modifiers = { mandatory = [ "shift" ]; }; };

  simultaneousOptions = {
    key_down_order = "insensitive";
    key_up_order = "insensitive";
    key_up_when = "any";
  };

  # A kana can only have a shifted twin if its romaji starts with a letter that
  # can carry the shift. `reserved` additionally holds back keys whose shifted
  # form is wanted as a symbol on that particular plane.
  hasShiftTwin = reserved: entry:
    isLetter (builtins.substring 0 1 entry.romaji)
    && !(entry ? key && lib.elem entry.key reserved);

  # --- manipulators ----------------------------------------------------------

  mkChord = shifted: entry: {
    type = "basic";
    parameters."basic.simultaneous_threshold_milliseconds" =
      if lib.length entry.keys >= 3
      then chordThresholdMs.three
      else chordThresholdMs.two;
    from = {
      simultaneous = map (k: { key_code = k; }) entry.keys;
      simultaneous_options = simultaneousOptions;
    } // mandatoryShift shifted;
    to = toEvents shifted entry.romaji;
    conditions = chordConditions;
  };

  mkPlaneKey = { conditions }: shifted: entry: {
    type = "basic";
    from = { key_code = entry.key; } // mandatoryShift shifted;
    to = toEvents shifted entry.romaji;
    inherit conditions;
  };

  mkShiftPlaneKey = mkPlaneKey { conditions = [ kanaModeCondition shiftPlaneHeld ]; };
  mkSingleKey = mkPlaneKey { conditions = [ kanaModeCondition shiftPlaneFree ]; };

  # The center shift, D1 "pure dual-role": holding the space bar reaches the
  # shift plane for as long as it is held, exactly like Yamabuki-R's center
  # shift, and a bare tap emits a space when the key comes back up.
  #
  # Shift+space is the full-width space: `z` then space hits macSKK's stock
  # `z ,　` rule. That costs macSKK's ⇧Space (start conversion from a completion
  # candidate) inside kana mode.
  mkSpace = shifted: {
    type = "basic";
    from = { key_code = "spacebar"; } // mandatoryShift shifted;
    to = [ { set_variable = { name = shiftVar; value = 1; }; } ];
    to_if_alone =
      if shifted
      then [ { key_code = "z"; } { key_code = "spacebar"; repeat = false; } ]
      else [ { key_code = "spacebar"; } ];
    to_after_key_up = [ { set_variable = { name = shiftVar; value = 0; }; } ];
    conditions = [ kanaModeCondition ];
  };

  # layout.optional carries the v18 cells that are not kana. They still have to
  # be wired up: a key inside the 30-key block with no manipulator falls through
  # to macSKK and gets run through the romaji table, so a bare `u` would type う
  # and 、 / 。 would be unreachable entirely.
  #
  # v18 appends Enter to 、 and 。 (the author writes vertical fiction); that is
  # dropped here. The comma and period key codes are sent raw so macSKK's stock
  # `&comma;,、` and `.,。` rows do the conversion.
  #
  # `repeat` matters per key. `t` and `y` appear in no chord, so letting the
  # arrows repeat is safe and useful. `u`, `v` and `m` are all chord keys, and a
  # repeating backspace while the other hand reaches for `f` would eat the line.
  functionalKeyEvents = {
    left = [{ key_code = "left_arrow"; }];
    right = [{ key_code = "right_arrow"; }];
    backspace = [{ key_code = "delete_or_backspace"; repeat = false; }];
    shift_left = [{ key_code = "left_arrow"; modifiers = [ "left_shift" ]; }];
    shift_right = [{ key_code = "right_arrow"; modifiers = [ "left_shift" ]; }];
    touten_enter = [{ key_code = "comma"; repeat = false; }];
    kuten_enter = [{ key_code = "period"; repeat = false; }];
  };

  mkFunctionalKey = entry: {
    type = "basic";
    from = { key_code = lib.head entry.keys; };
    to = functionalKeyEvents.${entry.action};
    conditions = [
      kanaModeCondition
      (if entry.plane == "shift" then shiftPlaneHeld else shiftPlaneFree)
    ];
  };

  functionalKeys =
    map mkFunctionalKey (layout.optional.editing ++ layout.optional.punctuation);

  # `/` is れ on both planes, so macSKK's Abbrev key needs a new home. `q` has no
  # kana of its own in Naginata (it only ever appears in small-kana chords), so
  # q+/ is free and keeps the whole thing declarative.
  abbrevChord = {
    type = "basic";
    parameters."basic.simultaneous_threshold_milliseconds" = chordThresholdMs.two;
    from = {
      simultaneous = [ { key_code = "q"; } { key_code = "slash"; } ];
      simultaneous_options = simultaneousOptions;
    };
    to = [ { key_code = "slash"; repeat = false; } ];
    conditions = chordConditions;
  };

  # Shift plus a chord is a hard reach: ▽きょ is Shift plus `w` plus `i`, three
  # keys at once across both hands. Tapping Shift on its own instead arms
  # `pendingShiftVar`, so the ▽ can be armed first and the chord typed
  # unshifted afterwards.
  #
  # This used to send macSKK's Sticky Shift key (semicolon) instead of setting
  # a variable, on the assumption that Sticky Shift marks the next input as a
  # headword the same way a real Shift does. It does not: macSKK documents
  # Sticky Shift as shifting only the one physical keystroke bound to it, so a
  # synthetic semicolon from Karabiner landed on macSKK's own handling of that
  # key rather than on the kana that followed, and produced a stray っ. Tracking
  # the pending state as our own Karabiner variable instead means this rule
  # never has to guess what macSKK does with the key it is sent.
  #
  # Holding Shift still works, so both routes stay live and the fingers pick.
  # The pending variant of every shifted twin below reads `pendingShiftVar` and
  # clears it, so this still covers singles, the shift plane, chords and
  # okurigana alike, at the cost of one extra manipulator per shifted twin
  # rather than the one-manipulator-per-shift-key of the semicolon approach.
  #
  # `lazy` keeps the modifier silent until another key joins it, which is the
  # documented pairing for `to_if_alone` on a modifier.
  mkStickyShift = key: {
    type = "basic";
    from = { key_code = key; modifiers = { optional = [ "any" ]; }; };
    to = [{ key_code = key; lazy = true; }];
    to_if_alone = [{ set_variable = { name = pendingShiftVar; value = 1; }; }];
    conditions = [ kanaModeCondition ];
  };

  # The pending-shift twin of a shifted manipulator: same trigger as the plain
  # unshifted key (`mk false entry`), gated additionally on `pendingShiftVar`,
  # producing the same output as the shifted twin (`mk true entry`) and then
  # clearing the flag. Must be listed before the plain unshifted manipulator it
  # shadows, since Karabiner takes the first manipulator that matches -- see
  # bothVariants.
  mkPending = mk: entry:
    let unshifted = mk false entry; in
    unshifted // {
      to = [ resetPendingShift ] ++ (mk true entry).to;
      conditions = unshifted.conditions ++ [ pendingShiftHeld ];
    };

  # --- assembly --------------------------------------------------------------

  chordsOfLength = n: lib.filter (e: lib.length e.keys == n) layout.combos;

  # For each entry with a shifted twin: the mandatory-modifier manipulator
  # (physical Shift held through the whole gesture), then its pending-shift
  # twin (Shift tapped alone beforehand, see mkPending), then the plain
  # unshifted manipulator for every entry. The pending twin must sit between
  # the two since it shares its `from` with the unshifted one and Karabiner
  # takes the first match.
  bothVariants = { mk, reserved ? [ ] }: entries:
    let twins = lib.filter (hasShiftTwin reserved) entries; in
    map (mk true) twins
    ++ map (mkPending mk) twins
    ++ map (mk false) entries;

  # Longest chords first: 30 of the 57 two-key chords are a subset of a
  # three-key chord, and Karabiner takes the first manipulator that matches.
  manipulators =
    bothVariants { mk = mkChord; } (chordsOfLength 3)
    ++ bothVariants { mk = mkChord; } (chordsOfLength 2)
    ++ [ abbrevChord ]
    ++ [ (mkSpace true) (mkSpace false) ]
    ++ map mkStickyShift [ "left_shift" "right_shift" ]
    ++ bothVariants { mk = mkShiftPlaneKey; } layout.shift
    ++ bothVariants { mk = mkSingleKey; reserved = noShiftTwinKeys; } layout.single
    ++ functionalKeys;

in
{
  inherit description manipulators;

  rule = { inherit description manipulators; };

  # Handy for `nix-instantiate --eval` when checking what was generated.
  stats = {
    total = lib.length manipulators;
    chords3 = lib.length (chordsOfLength 3);
    chords2 = lib.length (chordsOfLength 2);
    shiftPlane = lib.length layout.shift;
    single = lib.length layout.single;
    shiftTwins = lib.length (lib.filter (m: m.from ? modifiers) manipulators);
  };
}
