{
  pkgs,
  ...
}:
rec {
  home.packages = with pkgs; [
    devenv
    sheldon

    starship

    tree
    eza
    bat

    tmux

    ripgrep
    lua5_1
    luarocks

    cargo
    rustc

    pkg-config
    openssl
    openssl.dev
    gcc14
  ];

  home.file = {
    ".zshrc".source = ../home/.zshrc;
    ".config/sheldon" = {
      source = ../home/.config/sheldon;
      recursive = true;
    };
  };
}

