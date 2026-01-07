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

  home.file = {
    ".emacs.d" = {
      source = ./config;
      recursive = true;
    };
  };
}
