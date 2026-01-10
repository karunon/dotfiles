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
    claude-code-overlay = {
      url = "github:ryoppippi/claude-code-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = inputs:
    let
      # Supported systems
      linuxSystem = "x86_64-linux";
      darwinSystems = [ "x86_64-darwin" "aarch64-darwin" ];

      # Helper function to create pkgs for a system
      mkPkgs = system: import inputs.nixpkgs {
        inherit system;
        config.allowUnfree = true;
        overlays = [
          inputs.claude-code-overlay.overlays.default
        ];
      };

      # Helper function to create home-manager configuration
      mkHomeConfiguration = system: inputs.home-manager.lib.homeManagerConfiguration {
        pkgs = mkPkgs system;
        extraSpecialArgs = {
          inherit inputs;
        };
        modules = [
          ./nix/modules/home
          inputs.claude-code-overlay.homeManagerModules.default
        ];
      };
    in
    {
      # NixOS configurations (WSL)
      nixosConfigurations = {
        wsl = inputs.nixos.lib.nixosSystem {
          system = linuxSystem;
          modules = [
            ./nix/modules/linux/nixos.nix
          ];
          specialArgs = {
            nixos-wsl = inputs.nixos-wsl;
          };
        };
      };

      # Home Manager configurations (user-level only, no root required)
      homeConfigurations = {
        # Linux (WSL)
        myHome = mkHomeConfiguration linuxSystem;
        # macOS Intel
        "karunon@macos-x86" = mkHomeConfiguration "x86_64-darwin";
        # macOS Apple Silicon
        "karunon@macos-arm" = mkHomeConfiguration "aarch64-darwin";
      };
    };
}
