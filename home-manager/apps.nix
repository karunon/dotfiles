{
  pkgs,
  ...
}:
{
  home.packages = with pkgs; [
    devenv
    sheldon

    starship

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

    pkg-config
    openssl
    openssl.dev
    gcc14
    gnumake

    glib
    gdk-pixbuf
    cairo
    pango
    atkmm
    libsoup_3
    gtk3
  ];

  home.file = {
    ".gitconfig".source = ../home/.gitconfig;
    ".zshrc".source = ../home/.zshrc;
    ".config/sheldon" = {
      source = ../home/.config/sheldon;
      recursive = true;
    };
  };
}

