{ config, pkgs, ... }:

{
  home.file.".zshrc".source = ./zshrc;
  home.file.".config/sheldon/plugins.toml".source = ./sheldon/plugins.toml;
  home.file.".config/zeno/config.yml".source = ./zeno/config.yml;
}
