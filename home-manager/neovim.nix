{
  pkgs,
  ...
}:

{
  programs.neovim = {
    enable = true;
    defaultEditor = true;
    viAlias = true;
    vimAlias = true;

    extraLuaPackages = ps: [ ps.magick ps.tiktoken_core ];
    extraPackages = with pkgs; [
      # tree-sitter
      tree-sitter
      # lsp. formatter, linter
      lua-language-server
      rust-analyzer
    ];
  };

  home.file.".config/nvim" = {
    source = ../home/.config/nvim;
    recursive = true;
  };
}

