{
  pkgs,
  lib,
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

    zellij

    tree
    eza
    bat

    tmux

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

    claude-code
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
  darwinPackages = with pkgs; [
    # Add macOS-specific packages here if needed
  ];
in
{
  home.packages = commonPackages
    ++ lib.optionals pkgs.stdenv.isLinux linuxPackages
    ++ lib.optionals pkgs.stdenv.isDarwin darwinPackages;

  home.file = {
    ".gitconfig".source = ../home/.gitconfig;
    ".zshrc".source = ../home/.zshrc;
    ".config/sheldon" = {
      source = ../home/.config/sheldon;
      recursive = true;
    };
    ".config/zellij" = {
      source = ../home/.config/zellij;
      recursive = true;
    };
    ".config/rio" = {
      source = ../home/.config/rio;
      recursive = true;
    };
  };
}
