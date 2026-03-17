{
  pkgs,
  lib,
  inputs,
  ...
}:
let
  # Common packages for all platforms
  commonPackages = with pkgs; [
    git
    zsh

    devenv
    sheldon

    starship

    #zellij
    tmux

    lazygit

    tree
    eza
    bat

    gh
    ghq
    fzf

    ripgrep
    lua5_1
    luarocks

    nodejs_24
    yarn
    pnpm
    deno
    bun

    go

    rustup

    uv

    colima
    docker
  ];

  # Linux-specific packages
  linuxPackages = with pkgs; [
    pkg-config
    openssl
    openssl.dev
    gcc14
    gnumake

    # GTK/GUI libraries (Linux only)
    glib
    gdk-pixbuf
    cairo
    pango
    atkmm
    libsoup_3
    gtk3
  ];

  # macOS-specific packages
  darwinPackages = [
    inputs.arto.packages.${pkgs.system}.default
  ];
in
{
  home.packages = commonPackages
    ++ lib.optionals pkgs.stdenv.isLinux linuxPackages
    ++ lib.optionals pkgs.stdenv.isDarwin darwinPackages;
}
