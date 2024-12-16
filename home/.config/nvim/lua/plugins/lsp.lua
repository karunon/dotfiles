return {
  "neovim/nvim-lspconfig",
  dependencies = {
    {
      "williamboman/mason.nvim",
      enabled = not vim.fn.executable("home-manager"),
    },
    {
      "williamboman/mason-lspconfig.nvim",
      enabled = not vim.fn.executable("home-manager"),
    },
    {
      "hrsh7th/nvim-cmp",
    },
    {
      "hrsh7th/cmp-nvim-lsp",
    },
    {
      "hrsh7th/vim-vsnip",
    },
  },
  config = function()
    local lspconfig = require("lspconfig")
    local server_list = {
      "rust_analyzer",
      "lua_ls",
    }

    -- Handlers for each language server
    local setup_handler = function(server_name)
      local default_opts = {
        capabilities = vim.tbl_deep_extend(
          "force",
          vim.lsp.protocol.make_client_capabilities(),
          require("cmp_nvim_lsp").default_capabilities()
        ),
      }
    end

    -- Setup ls with mason or without mason
    if vim.fn.executable("home-manager") then
      for _, server in ipairs(server_list) do
        setup_handler(server)
      end
    else  
      require("mason").setup {
        ui = {
          check_outdated_package_on_open = false,
        },
        PATH = "append",
      }

      local mason_lsp = require("mason-lspconfig")
      mason_lsp.setup {
        ensure_installed = server_list,
      }

      mason_lsp.setup_handlers { setup_handlers }
    end
  end,
}

