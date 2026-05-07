# Nix overlays for custom package modifications
[
  (final: prev: {
    # direnv: GNUmakefile adds -linkmode=external on Darwin,
    # which requires CGO, but nixpkgs sets CGO_ENABLED=0.
    # https://github.com/NixOS/nixpkgs/pull/503298
    direnv = prev.direnv.overrideAttrs (old: prev.lib.optionalAttrs prev.stdenv.isDarwin {
      env = (old.env or {}) // { CGO_ENABLED = "1"; };
    });

    # deno: compile tests (trybuild) fail on nixpkgs-unstable
    deno = prev.deno.overrideAttrs (_: {
      doCheck = false;
    });
  })
]
