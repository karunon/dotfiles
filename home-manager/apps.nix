{
  pkgs,
  ...
}:
rec {
  home.packages = with pkgs; [
    sheldon

    tree
    eza
    bat

    ripgrep
    lua5_1
    luarocks
  ];

  home.file = {
    ".zshrc".source = ../home/.zshrc;
    ".config/sheldon" = {
      source = ../home/.config/sheldon;
      recursive = true;
    };
  };
}

