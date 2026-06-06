{ config, pkgs, ... }:

{
  programs.tmux = {
    enable = true;
    extraConfig = builtins.readFile ./tmux.conf;
  };

  home.file.".tmux.conf" = {
    source = ./tmux.conf;
    force = true;
  };
}
