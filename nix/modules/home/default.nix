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
    ./packages.nix
    ../../../nvim
    ../../../emacs
    ../../../git
    ../../../zsh
    ../../../rio
    ../../../zellij
    ../../../macSKK
    ../../../tmux
  ];
  programs.direnv = {
    enable = true;
    enableZshIntegration = true;
    nix-direnv.enable = true;
  };
  # Enable Claude Code CLI from overlay
  programs.claude-code = {
    enable = true;
    package = pkgs.claude-code;
  };
}
