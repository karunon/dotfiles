{ pkgs, ... }:

# ============================================================================
# NOTE: This file is NO LONGER USED
# ============================================================================
# This configuration has been replaced with standalone Home Manager to avoid
# requiring root/sudo privileges. Home Manager provides user-level package
# management and dotfiles configuration without system-level permissions.
#
# This file is kept for reference only. The settings below were previously
# managed by nix-darwin but need to be configured manually on macOS now:
#
# - Dock settings (autohide, tilesize, show-recents)
# - Finder settings (show extensions, path bar)
# - Keyboard settings (key repeat rate, autocorrect)
#
# To configure these manually, use System Preferences or `defaults` command.
#
# For package management and dotfiles, use Home Manager instead:
#   home-manager switch --flake .#karunon@macos-arm  # Apple Silicon
#   home-manager switch --flake .#karunon@macos-x86  # Intel
# ============================================================================

{
  # Disable nix-darwin's Nix management (using Determinate Nix)
  nix.enable = false;

  # Allow unfree packages
  nixpkgs.config.allowUnfree = true;

  # System packages (available system-wide)
  environment.systemPackages = with pkgs; [
    git
    zsh
  ];

  # Zsh configuration
  programs.zsh.enable = true;

  # Set default shell
  environment.shells = [ pkgs.zsh ];

  # macOS system settings
  system = {
    # Set state version
    stateVersion = 5;

    # Primary user for user-specific settings
    primaryUser = "karunon";

    # System defaults
    defaults = {
      # Dock settings
      dock = {
        autohide = true;
        show-recents = false;
        tilesize = 48;
      };

      # Finder settings
      finder = {
        AppleShowAllExtensions = true;
        ShowPathbar = true;
        FXEnableExtensionChangeWarning = false;
      };

      # Global settings
      NSGlobalDomain = {
        AppleShowAllExtensions = true;
        InitialKeyRepeat = 15;
        KeyRepeat = 2;
        NSAutomaticCapitalizationEnabled = false;
        NSAutomaticSpellingCorrectionEnabled = false;
      };
    };
  };

  # User configuration
  users.users.karunon = {
    name = "karunon";
    home = "/Users/karunon";
  };

  # Homebrew integration (optional, for GUI apps not in nixpkgs)
  # Uncomment if you want to use homebrew alongside nix
  # homebrew = {
  #   enable = true;
  #   onActivation = {
  #     autoUpdate = true;
  #     cleanup = "zap";
  #   };
  #   casks = [
  #     # Add your GUI apps here
  #   ];
  # };
}
