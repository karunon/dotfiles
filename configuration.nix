# Edit this configuration file to define what should be installed on
# your system. Help is available in the configuration.nix(5) man page, on
# https://search.nixos.org/options and in the NixOS manual (`nixos-help`).

# NixOS-WSL specific options are documented on the NixOS-WSL repository:
# https://github.com/nix-community/NixOS-WSL

{ pkgs, nixos-wsl, ... }:

{
  imports = [
    # include NixOS-WSL modules
    #<nixos-wsl/modules>
    nixos-wsl.nixosModules.wsl
  ];

  nix = {
    settings = {
      experimental-features = ["nix-command" "flakes"];
    };
  };

  wsl.enable = true;
  #wsl.defaultUser = "nixos";

  users.users.karunon = {
    shell = pkgs.zsh;
    isNormalUser = true;
    extraGroups = [ "wheel" ];
  };

  programs = {
    git = {
      enable = true;
    };
    #neovim = {
    #  enable = true;
    #  defaultEditor = true;
    #  viAlias = true;
    #  vimAlias = true;
    #};
    starship = {
      enable = true;
    };
    zsh = { 
      enable = true;
    };
  };

  security.sudo = {
    enable = true;
  };

  virtualisation.docker = {
    enable = true;
    rootless = {
      enable = true;
      setSocketVariable = true;
    };
  };


  # This value determines the NixOS release from which the default
  # settings for stateful data, like file locations and database versions
  # on your system were taken. It's perfectly fine and recommended to leave
  # this value at the release version of the first install of this system.
  # Before changing this value read the documentation for this option
  # (e.g. man configuration.nix or on https://nixos.org/nixos/options.html).
  system.stateVersion = "24.11"; # Did you read the comment?
}

