{
  pkgs,
  ...
}:
let
  username = "karunon";
  homeDirectory = if pkgs.stdenv.isDarwin then "/Users/${username}" else "/home/${username}";
in
{
  home = {
    inherit username homeDirectory;
    stateVersion = "24.11";
  };
  programs.home-manager.enable = true;
  imports = [
    ./neovim.nix
    ./apps.nix
    ./emacs.nix
  ];
  programs.direnv = {
    enable = true;
    enableZshIntegration = true;
    nix-direnv.enable = true;
  };
}
