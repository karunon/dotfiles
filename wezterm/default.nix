{ config, pkgs, ... }:

{
  home.file.".config/wezterm/wezterm.lua" = {
    source = ./wezterm.lua;
    force = true;
  };
}
