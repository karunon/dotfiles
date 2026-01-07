{ config, pkgs, ... }:

{
  home.file.".config/zellij/config.kdl".source = ./config.kdl;
}
