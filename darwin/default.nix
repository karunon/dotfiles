{ pkgs, ... }:

{
  # Nix configuration
  nix = {
    settings = {
      experimental-features = [ "nix-command" "flakes" ];
      trusted-users = [ "root" "karunon" ];
    };
  };

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
