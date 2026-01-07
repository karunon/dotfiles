# Claude Code Guide for dotfiles

This repository manages system configuration and dotfiles using Nix, NixOS-WSL, and Home Manager.

## Repository Structure

```
.
├── flake.nix                    # Nix flake configuration (entry point)
├── nix/                         # Nix configuration modules
│   ├── modules/
│   │   ├── home/                # Cross-platform Home Manager configuration
│   │   │   ├── default.nix      # Main Home Manager configuration
│   │   │   └── packages.nix     # Package definitions
│   │   ├── darwin/              # macOS-specific configurations
│   │   │   └── default.nix
│   │   └── linux/               # Linux-specific configurations
│   │       ├── default.nix
│   │       └── nixos.nix        # NixOS system configuration (WSL)
│   └── overlays/                # Nix package overlays
│       └── default.nix
├── zsh/                         # Zsh shell configuration
│   ├── default.nix              # Home Manager integration
│   ├── zshrc                    # Zsh configuration file
│   └── sheldon/                 # Sheldon plugin manager
│       └── plugins.toml
├── git/                         # Git configuration
│   ├── default.nix              # Home Manager integration
│   └── config                   # Git config file
├── nvim/                        # Neovim configuration
│   ├── default.nix              # Home Manager integration with plugins
│   └── lua/                     # Neovim Lua configuration
│       ├── init.lua
│       └── ...
├── emacs/                       # Emacs configuration
│   ├── default.nix              # Home Manager integration
│   └── config/                  # Emacs configuration files
│       ├── init.el
│       ├── early-init.el
│       └── custom.el
├── rio/                         # Rio Terminal configuration
│   ├── default.nix              # Home Manager integration
│   └── config.toml
└── zellij/                      # Zellij multiplexer configuration
    ├── default.nix              # Home Manager integration
    └── config.kdl
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

#### Linux (`nix/modules/linux/nixos.nix`)
- WSL integration
- Docker with rootless mode
- Git, Zsh, and Starship prompt
- User account setup for `karunon`

#### macOS
- **No system-level configuration** - using Home Manager only
- macOS system settings (Dock, Finder, keyboard) must be configured **manually**
- **No root/sudo required** for package management and dotfiles

### User Level (`nix/modules/home/`)
- **packages.nix**: User packages (platform-aware)
- **default.nix**: Main Home Manager configuration with module imports
- **direnv**: Automatic environment activation

### Application Configurations
Each application has its own directory with a `default.nix` for Home Manager integration:
- **zsh/**: Shell configuration with sheldon plugin manager
- **git/**: Git configuration
- **nvim/**: Neovim with lazy.nvim, LSP, and completion
- **emacs/**: Emacs configuration
- **rio/**: Rio Terminal settings
- **zellij/**: Zellij multiplexer configuration

## Directory Organization Philosophy

This repository follows a **per-application modular structure** inspired by modern dotfiles practices:

- Each tool/application has its own top-level directory
- Configuration files are stored alongside their Nix definitions
- Clear separation between cross-platform (`nix/modules/home/`) and platform-specific configs
- No "legacy" or ambiguous config locations - everything has a clear purpose

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

1. **Modify configuration files** in the appropriate directory (e.g., `zsh/`, `nvim/`, `nix/modules/`)
2. **Test changes** with `nixos-rebuild` (Linux) or `home-manager switch` (macOS)
3. **Commit changes** to version control
4. **Update dependencies periodically** with `nix flake update`

### Adding a New Application

1. Create a new directory at the root level (e.g., `wezterm/`)
2. Add a `default.nix` with Home Manager configuration
3. Place config files in the same directory
4. Import the module in `nix/modules/home/default.nix`

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
- Changes to `nix/modules/linux/nixos.nix` require `sudo nixos-rebuild switch` (Linux only)
- Changes to any module require `home-manager switch` (no sudo needed on macOS)
- Application configs are in their respective top-level directories (e.g., `zsh/`, `nvim/`)
- Use `pkgs.stdenv.isLinux` / `pkgs.stdenv.isDarwin` for platform-specific code in `nix/modules/home/packages.nix`
- All configurations are declaratively managed via Nix - no legacy configs
- To add a new tool: create `toolname/default.nix` and import in `nix/modules/home/default.nix`
- **macOS**: System settings are no longer managed by Nix - configure manually using `defaults` or System Preferences
