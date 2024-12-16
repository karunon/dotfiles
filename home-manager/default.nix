{
  pkgs,
  ...
}:
{
  home = rec {
    username = "shirono";
    homeDirectory = "/home/${username}";
    stateVersion = "24.11";
  };
  programs.home-manager.enable = true;
  imports = [
    ./neovim.nix
    ./apps.nix
  ];
}

