{ ... }:
{
  # Enable Claude Code CLI from overlay
  programs.claude-code.enable = true;

  # Deploy .claude configuration files (commands, skills, settings)
  home.file.".claude" = {
    source = ./.;
    recursive = true;
  };
}
