{
  config,
  pkgs,
  ...
}:

{
  home.packages = with pkgs; [
    emacs
    # lsp
    clang-tools
  ];

  home.file = {
    ".emacs.d" = {
      source = ./config;
      recursive = true;
    };
  };
}
