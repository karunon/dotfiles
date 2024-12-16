{
  inputs = {
    nixos.url = "github:NixOS/nixpkgs/nixos-24.11";
    nixos-wsl = {
      type = "github";
      owner = "nix-community";
      repo = "NixOS-WSL";
      ref = "2405.5.4";
    };
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = inputs:
    let
      system = "x86_64-linux";
    in
    {
    nixosConfigurations = {
      wsl = inputs.nixos.lib.nixosSystem {
        system = system;
        modules = [
          ./configuration.nix
        ];
        specialArgs = {
          nixos-wsl = inputs.nixos-wsl;
        };
      };
    };
    homeConfigurations = {
      myHome = inputs.home-manager.lib.homeManagerConfiguration {
        pkgs = import inputs.nixpkgs {
          system = system;
          config.allowUnfree = true;
        };
        extraSpecialArgs = {
          inherit inputs;
        };
        modules = [
          ./home-manager/default.nix
        ];
      };
    };
  };
}

