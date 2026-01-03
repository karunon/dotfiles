# Neovim Configuration Guide

このディレクトリには、lazy.nvimを使用したNeovimの設定が含まれています。

## ディレクトリ構造

```
.
├── init.lua              # エントリーポイント
├── lazy-lock.json        # プラグインのバージョンロック
└── lua/
    ├── core/
    │   ├── lazy.lua      # lazy.nvimのブートストラップ
    │   └── options.lua   # Neovimの基本設定
    └── plugins/
        ├── cmp.lua       # 補完設定（nvim-cmp）
        ├── lsp.lua       # LSP設定（nvim-lspconfig）
        └── lualine.lua   # ステータスライン設定
```

## プラグインマネージャー

- **lazy.nvim** (`folke/lazy.nvim`)
  - モダンなプラグインマネージャー
  - 遅延読み込み対応
  - ブートストラップ処理は `lua/core/lazy.lua:2-16` で実装

## インストールされているプラグイン

### UI関連
- **lualine.nvim** (`nvim-lualine/lualine.nvim`)
  - ステータスライン
  - テーマ: nord
  - 依存: nvim-web-devicons

- **nvim-web-devicons** (`nvim-tree/nvim-web-devicons`)
  - ファイルアイコン表示

### LSP関連
- **nvim-lspconfig** (`neovim/nvim-lspconfig`)
  - LSPクライアント設定
  - 即座読み込み（`lazy = false`, `priority = 50`）
  - 対応言語サーバー:
    - rust_analyzer (Rust)
    - lua_ls (Lua)
    - nil_ls (Nix)
  - キーマッピング（LSPアタッチ時に自動設定）:
    - `gd`: 定義ジャンプ（quickfixリストに表示）
    - `gr`: 参照検索（quickfixリストに表示）
    - `K`: ホバー（ドキュメント表示）
    - `<leader>rn`: 変数名リネーム
    - `<leader>ca`: コードアクション

- **mason.nvim** (`williamboman/mason.nvim`)
  - LSPサーバーのインストールマネージャー
  - home-managerが存在する場合は無効化（`enabled = not vim.fn.executable("home-manager")`）

- **mason-lspconfig.nvim** (`williamboman/mason-lspconfig.nvim`)
  - masonとlspconfig間の統合
  - home-managerが存在する場合は無効化

- **cmp-nvim-lsp** (`hrsh7th/cmp-nvim-lsp`)
  - LSPクライアントの拡張capabilities提供（lsp.luaの依存関係）

### 補完関連
- **nvim-cmp** (`hrsh7th/nvim-cmp`)
  - 補完エンジン
  - イベント: InsertEnter, CmdlineEnter（遅延読み込み）
  - キーマッピング:
    - `<C-b>`: ドキュメントを上スクロール
    - `<C-f>`: ドキュメントを下スクロール
    - `<C-Space>`: 補完トリガー
    - `<C-e>`: 補完中止
    - `<CR>`: 補完確定

- **cmp-nvim-lsp** (`hrsh7th/cmp-nvim-lsp`)
  - LSPからの補完ソース

- **cmp-buffer** (`hrsh7th/cmp-buffer`)
  - バッファからの補完ソース

- **cmp-path** (`hrsh7th/cmp-path`)
  - ファイルパスの補完ソース

- **cmp-cmdline** (`hrsh7th/cmp-cmdline`)
  - コマンドラインモードの補完ソース

- **vim-vsnip** (`hrsh7th/vim-vsnip`)
  - スニペットエンジン

## 基本設定（`lua/core/options.lua`）

### エンコーディングと表示
- encoding: UTF-8
- termguicolors: true（24bit色対応）

### 行表示
- wrap: false（折り返しなし）
- number: true（行番号表示）
- cursorline: true（カーソル行ハイライト）

### インデント
- tabstop: 2
- expandtab: true（タブをスペースに展開）
- softtabstop: -1（shiftwidthと同じ値を使用）
- shiftwidth: 2
- shiftround: true（インデントを丸める）

## LSP設定の詳細（`lua/plugins/lsp.lua`）

### 環境に応じた設定
- **home-manager環境**: Nixで管理されたLSPサーバーを使用（`vim.lsp.enable()`で有効化）
- **非home-manager環境**: masonで自動インストール（`automatic_enable = true`）

### 言語サーバー別設定

#### lua_ls
- diagnostics.globals: `{"vim"}` - vimをグローバル変数として認識

#### rust_analyzer
- diagnostics.enable: false - 診断を無効化

#### nil_ls
- デフォルト設定のみ（Nix言語サーバー）

### LSPの機能設定
- **semantic tokens**: 無効化（`client.server_capabilities.semanticTokensProvider = nil`）
- **inlay hints**: 対応している場合は自動有効化
- **virtual text**: ソース表示を有効化（診断の出所を表示）
- **定義ジャンプ/参照検索**: quickfixリストに結果を表示する`on_list`ヘルパー関数を使用

### キーマッピング（`LspAttach`オートコマンド）
LSPがバッファにアタッチされた際に、以下のバッファローカルキーマッピングを自動設定：
- `gd`: 定義ジャンプ
- `gr`: 参照検索
- `K`: ホバー（ドキュメント表示）
- `<leader>rn`: シンボルリネーム
- `<leader>ca`: コードアクション

## 補完設定の詳細（`lua/plugins/cmp.lua`）

### 補完ソースの優先順位
1. LSP（最優先）
2. バッファ、パス（次点）

### コマンドライン補完
- 検索モード（`/`, `?`）: バッファからの補完
- コマンドモード（`:`）: コマンドライン補完

## リーダーキー
- leader: 空文字（未設定）
- localleader: `\`

## プラグインのバージョン（lazy-lock.json）
すべてのプラグインは最新のコミットハッシュで固定されています。
更新は `lazy.nvim` の `:Lazy update` コマンドで実行可能です。

## 最近の変更履歴

### 2026-01-03: LSP設定の修正
- **問題**: `vim.lsp.buf.definition()`と`vim.lsp.buf.references()`がプラグイン読み込み時に即座実行され、「method textDocument/definition is not supported」エラーが発生
- **修正**: LspAttachオートコマンド内でキーマッピングとして設定するよう変更
- **依存関係の整理**:
  - `nvim-cmp`と`vim-vsnip`の依存をlsp.luaから削除（cmp.luaで管理）
  - `cmp-nvim-lsp`のみlsp.luaの依存として保持（capabilities拡張のため）
- **キーマッピング追加**: `gd`, `gr`, `K`, `<leader>rn`, `<leader>ca`を追加

## 今後の更新について

この設定は比較的シンプルな構成ですが、以下の点に注意が必要です:

1. **Neovim APIの変更**: `vim.loop` から `vim.uv` への移行（`lua/core/lazy.lua:3`）は既に対応済み
2. **LSP設定の互換性**: LSP関連のAPIは頻繁に変更されるため、最新バージョンでの動作確認が必要
3. **mason.nvimの動作**: home-manager環境での条件分岐が正しく機能するか確認
4. **補完システム**: nvim-cmpの設定は比較的安定しているが、新しいソースの追加を検討する余地あり
5. **キーマッピングの拡張**: 必要に応じて`gi`（実装ジャンプ）、`<leader>f`（フォーマット）などを追加可能

## 推奨される改善点

- treesitterの追加（構文ハイライトの強化）
- telescopeの追加（ファジーファインダー）
- git統合（gitsigns.nvim等）
- より詳細なキーマッピング設定
- カラースキームの明示的な設定
