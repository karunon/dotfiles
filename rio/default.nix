{ config, pkgs, ... }:

{
  home.file.".config/rio/config.toml".source = ./config.toml;
}
