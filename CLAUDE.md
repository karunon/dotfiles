# Claude Code Guide for dotfiles

This repository manages system configuration and dotfiles using Nix, NixOS-WSL, and Home Manager.

## Repository Structure

```
.
├── flake.nix                    # Nix flake configuration (entry point)
├── configuration.nix            # NixOS system configuration (WSL)
├── home-manager/
│   ├── default.nix              # Home Manager main configuration
│   ├── apps.nix                 # Application packages and settings
│   ├── neovim.nix               # Neovim configuration
│   └── emacs.nix                # Emacs configuration
└── home/                        # Legacy dotfiles and config files
    ├── .config/nvim/            # Neovim config (Lua-based, lazy.nvim)
    ├── .config/sheldon/         # Sheldon (zsh plugin manager)
    └── .emacs.d/                # Emacs config and packages
```

## Supported Platforms

- **Linux (NixOS-WSL)**: Full NixOS system on Windows WSL
- **macOS (Intel)**: Home Manager only (no root/sudo required)
- **macOS (Apple Silicon)**: Home Manager only (no root/sudo required)

## Key Technologies

- **Nix Flakes**: Declarative package management and system configuration
- **NixOS-WSL**: NixOS running on Windows Subsystem for Linux
- **Home Manager**: User environment and dotfiles management (no root required)
- **Neovim**: Configured with lazy.nvim, LSP, and completion
- **Emacs**: Package management and custom configuration
- **Zsh**: Shell with starship prompt and sheldon plugin manager
- **Docker**: Rootless Docker setup (Linux only)

## Configuration Overview

### System Level

#### Linux (`configuration.nix`)
- WSL integration
- Docker with rootless mode
- Git, Zsh, and Starship prompt
- User account setup for `karunon`

#### macOS
- **No system-level configuration** - using Home Manager only
- macOS system settings (Dock, Finder, keyboard) must be configured **manually**
- **No root/sudo required** for package management and dotfiles

### User Level (`home-manager/`)
- **apps.nix**: User packages (platform-aware)
- **neovim.nix**: Neovim setup with plugins via Nix
- **emacs.nix**: Emacs configuration
- **direnv**: Automatic environment activation

### Editor Configurations
- **Neovim**: Lua-based config with lazy.nvim, LSP (lua_ls, pyright, nil_ls), nvim-cmp
- **Emacs**: Traditional config with backup and native compilation cache

## Common Tasks

### Linux (NixOS-WSL)

```bash
# Rebuild NixOS system
sudo nixos-rebuild switch --flake .#wsl

# Rebuild Home Manager only
home-manager switch --flake .#myHome
```

### macOS

```bash
# First-time setup (no root/sudo required)
nix run home-manager -- switch --flake .#karunon@macos-arm  # Apple Silicon
nix run home-manager -- switch --flake .#karunon@macos-x86  # Intel

# Subsequent updates (after home-manager is installed)
home-manager switch --flake .#karunon@macos-arm  # Apple Silicon
home-manager switch --flake .#karunon@macos-x86  # Intel

# Configure macOS system settings manually if desired (one-time setup)
# Use System Preferences or the `defaults` command
# Then restart affected services: killall Dock Finder SystemUIServer
```

### Update Dependencies
```bash
nix flake update
```

### Check Flake Configuration
```bash
nix flake check
```

### Show Flake Outputs
```bash
nix flake show
```

## Development Workflow

1. **Modify configuration files** (`configuration.nix`, `home-manager/*.nix`)
2. **Test changes** with `nixos-rebuild` (Linux) or `home-manager switch` (macOS)
3. **Commit changes** to version control
4. **Update dependencies periodically** with `nix flake update`

## Platform-Specific Notes

### Linux-only packages
The following packages are only installed on Linux:
- Build tools: `pkg-config`, `gcc14`, `gnumake`
- OpenSSL development files
- GTK/GUI libraries: `glib`, `gdk-pixbuf`, `cairo`, `pango`, `gtk3`, etc.

### macOS-specific
- Home directory is `/Users/karunon` (vs `/home/karunon` on Linux)
- **System settings must be configured manually** using `defaults` command or System Preferences
- Homebrew can be installed separately for GUI apps not in nixpkgs

## Important Notes

- System state version: 24.11
- Using nixpkgs-unstable for Home Manager
- Allow unfree packages enabled
- Experimental features enabled: `nix-command` and `flakes`

## Useful Commands

```bash
# Search for packages
nix search nixpkgs <package-name>

# List installed generations
nix-env --list-generations

# Garbage collect old generations
nix-collect-garbage -d

# Check what changed between generations
nix store diff-closures
```

## Tips for Claude Code

- When modifying Nix files, ensure proper syntax (attribute sets, lists, functions)
- Changes to `configuration.nix` require `sudo nixos-rebuild switch` (Linux only)
- Changes to `home-manager/` files require `home-manager switch` (no sudo needed on macOS)
- The `home/` directory contains legacy configs that may override Nix-managed configs
- Use `pkgs.stdenv.isLinux` / `pkgs.stdenv.isDarwin` for platform-specific code
- Consider migrating configs from `home/` to `home-manager/` for full declarative management
- **macOS**: System settings are no longer managed by Nix - configure manually using `defaults` or System Preferences
