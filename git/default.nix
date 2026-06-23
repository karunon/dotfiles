{ config, pkgs, lib, ... }:

{
  home.file.".gitconfig" = lib.mkIf (config.home.username == "karunon") {
    source = ./config;
  };
}
