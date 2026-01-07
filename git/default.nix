{ config, pkgs, ... }:

{
  home.file.".gitconfig".source = ./config;
}
