{ config, pkgs, ... }:

{
  home.file.".pi/agent/settings.json" = {
    source = ./settings.json;
    force = true;
  };
  home.file.".pi/agent/models.json" = {
    source = ./models.json;
    force = true;
  };
  home.file.".pi/agent/presets.json" = {
    source = ./presets.json;
    force = true;
  };
  home.file.".pi/agent/container.json" = {
    source = ./container.json;
    force = true;
  };
  home.file.".pi/agent/sandbox-profiles.json" = {
    source = ./sandbox-profiles.json;
    force = true;
  };
  home.file.".pi/agent/network-policy.json" = {
    source = ./network-policy.json;
    force = true;
  };
  home.file.".pi/agent/permissions.json" = {
    source = ./permissions.json;
    force = true;
  };
  home.file.".pi/agent/secrets.json" = {
    source = ./secrets.json;
    force = true;
  };
  home.file.".pi/agent/usage-guard.json" = {
    source = ./usage-guard.json;
    force = true;
  };
  home.file.".pi/agent/hooks.json" = {
    source = ./hooks.json;
    force = true;
  };
  home.file.".pi/agent/mcp.json" = {
    source = ./mcp.json;
    force = true;
  };
  home.file.".pi/agent/audit.json" = {
    source = ./audit.json;
    force = true;
  };
  home.file.".pi/agent/keybindings.json" = {
    source = ./keybindings/nvim.json;
    force = true;
  };
  home.file.".pi/agent/keybindings/nvim.json" = {
    source = ./keybindings/nvim.json;
    force = true;
  };
  home.file.".pi/agent/keybindings/helix.json" = {
    source = ./keybindings/helix.json;
    force = true;
  };
  home.file.".pi/agent/dotfiles-package".source = ./package;
  home.file.".pi/agent/agents".source = ./agents;

  home.sessionVariables = {
    PI_TELEMETRY = "0";
    PI_SKIP_VERSION_CHECK = "1";
    PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
  };
}
