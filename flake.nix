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
    nix-darwin = {
      url = "github:nix-darwin/nix-darwin/master";
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
      };

      # Helper function to create home-manager configuration
      mkHomeConfiguration = system: inputs.home-manager.lib.homeManagerConfiguration {
        pkgs = mkPkgs system;
        extraSpecialArgs = {
          inherit inputs;
        };
        modules = [
          ./home-manager/default.nix
        ];
      };

      # Helper function to create darwin configuration
      mkDarwinConfiguration = system: inputs.nix-darwin.lib.darwinSystem {
        inherit system;
        specialArgs = {
          inherit inputs;
        };
        modules = [
          ./darwin/default.nix
          inputs.home-manager.darwinModules.home-manager
          {
            home-manager.useGlobalPkgs = true;
            home-manager.useUserPackages = true;
            home-manager.users.karunon = import ./home-manager/default.nix;
            home-manager.extraSpecialArgs = {
              inherit inputs;
            };
          }
        ];
      };
    in
    {
      # NixOS configurations (WSL)
      nixosConfigurations = {
        wsl = inputs.nixos.lib.nixosSystem {
          system = linuxSystem;
          modules = [
            ./configuration.nix
          ];
          specialArgs = {
            nixos-wsl = inputs.nixos-wsl;
          };
        };
      };

      # Darwin configurations (macOS)
      darwinConfigurations = {
        # Intel Mac
        macos-x86 = mkDarwinConfiguration "x86_64-darwin";
        # Apple Silicon Mac
        macos-arm = mkDarwinConfiguration "aarch64-darwin";
      };

      # Standalone home-manager configurations
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
