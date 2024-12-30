{
  config,
  home,
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
      nil
    ];
  };

  home.file =
    let
      symlink = config.lib.file.mkOutOfStoreSymlink;
      dotfiles = /home/karunon/dotfiles;
    in
    {
      ".config/nvim" = {
        source = (symlink /${dotfiles}/home/.config/nvim);
        recursive = true;
      };
    };
}

