{
  config,
  ...
}:

{
  programs.emacs = {
    enable = true;
  };

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

