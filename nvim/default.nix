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

    initLua = builtins.readFile ./init.lua;

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

  xdg.configFile."nvim/lazy-lock.json".source = ./lazy-lock.json;
  xdg.configFile."nvim/lua" = {
    source = ./lua;
    recursive = true;
  };
}
