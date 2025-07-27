{
  config,
  pkgs,
  ...
}:

{
  home.packages = with pkgs; [
    emacs30
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

