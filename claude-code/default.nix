{ pkgs, ... }:
{
  # Enable Claude Code CLI from overlay
  programs.claude-code = {
    enable = true;
    package = pkgs.claude-code;
  };

  # Deploy .claude configuration files (commands, skills, settings)
  home.file.".claude" = {
    source = ./.;
    recursive = true;
  };
}
