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

    nodejs_22
    yarn
    pnpm
    deno
    bun

    go

    rustup

    pkg-config
    openssl
    openssl.dev
    gcc14
    gnumake
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

