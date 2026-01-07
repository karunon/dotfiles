zstyle :compinstall filename '/home/shirono/.zshrc'

autoload -Uz compinit
compinit

HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=10000
setopt hist_ignore_dups
setopt autocd
unsetopt beep

function ghq-fzf() {
  local src=$(ghq list | fzf --preview "bat --color=always --style=header,grid --line-range :80 $(ghq root)/{}/README.*")
  if [ -n "$src" ]; then
    if [[ -n "$WIDGET" ]]; then
      # Called as a ZLE widget (from keybinding)
      BUFFER="cd $(ghq root)/$src"
      zle accept-line
      zle -R -c
    else
      # Called directly from command line
      cd "$(ghq root)/$src"
    fi
  fi
}
zle -N ghq-fzf
bindkey '^g' ghq-fzf

alias ls="eza"
alias ll="eza -ll"
alias la="eza -l -a"
alias cat="bat"

alias "$"=""

#eval "$(starship init zsh)"

# Rust package Cache Lock Resolution
# If you encounter "Blocking waiting for file lock on package cache" issue:
# Try removing the package cache file to resolve the problem
# Command: rm -rf ~/.cargo/.package-cache
if [ -d ~/.cargo/.package-cache ]; then
  rm -rf ~/.cargo/.package-cache
fi

eval "$(sheldon source)"
eval "$(starship init zsh)"

export PKG_CONFIG_PATH=$PKG_CONFIG_PATH:$HOME/.nix-profile/lib/pkgconfig

