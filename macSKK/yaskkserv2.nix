{ lib
, rustPlatform
, fetchFromGitHub
}:

rustPlatform.buildRustPackage rec {
  pname = "yaskkserv2";
  version = "unstable-2025-05-16";

  src = fetchFromGitHub {
    owner = "wachikun";
    repo = "yaskkserv2";
    rev = "7341a0fd2e9d05f371de1dd0e797c92662e35443";
    hash = "sha256-d037sMzr/9fa0Osl0ciQJT6FjdGlxqE7F/K+Iu+HJlw=";
  };

  cargoHash = "sha256-pj08zWyaXTeg6hffFzQo0cH8k1/A8npxwdLtgHnxUpE=";

  # Skip tests (many tests are environment-dependent)
  doCheck = false;

  meta = with lib; {
    description = "Yet Another SKK server (Rust implementation with Google Japanese Input support)";
    homepage = "https://github.com/wachikun/yaskkserv2";
    license = with licenses; [ asl20 mit ];
    maintainers = [ ];
    platforms = platforms.unix;
  };
}
