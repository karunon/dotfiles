{
  config,
  pkgs,
  ...
}:

{
  programs.emacs = {
    enable = true;
  };

  home.packages = with pkgs; [
    # lsp
    clang-tools
  ];

  home.file =
    let
      symlink = config.lib.file.mkOutOfStoreSymlink;
      dotfiles = /home/karunon/dotfiles;
    in
    {
      ".emacs.d" = {
        source = (symlink /${dotfiles}/home/.emacs.d);
        recursive = true;
      };
    };
}

