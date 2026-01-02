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
      "nil_ls",
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
      local opts = {}

      if server_name == "lua_ls" then
        opts.settings = {
          Lua = {
            diagnostics = {
              globals = { "vim" },
            },
          },
        }
      elseif server_name == "rust_analyzer" then
        opts.settings = {
          ['rust-analyzer'] = {
            diagnostics = {
              enable = false;
            },
          },
        }
      end

      lspconfig[server_name].setup(vim.tbl_deep_extend("force", default_opts, opts))
    end

    -- Setup ls with mason or without mason
    if vim.fn.executable("home-manager") then
      for _, server in ipairs(server_list) do
        setup_handler(server)
      end
    else  
      require("mason").setup {
        ui = {
          check_outdated_packages_on_open = false,
        },
        PATH = "append",
      }

      local mason_lsp = require("mason-lspconfig")
      mason_lsp.setup {
        ensure_installed = server_list,
      }

      mason_lsp.setup_handlers { setup_handler }
    end

    local function on_list(options)
      vim.fn.setqflist({}, " ", options)
      vim.api.nvim_command("cfirst")
    end

    vim.lsp.buf.definition({ on_list = on_list })
    vim.lsp.buf.references(nil, { on_list = on_list })
    vim.diagnostic.config({
      virtual_text = {
        source = true,
      },
    })

    vim.api.nvim_create_autocmd("LspAttach", {
      callback = function(args)
        local client = vim.lsp.get_client_by_id(args.data.client_id)
        if not client then
          return
        end
        client.server_capabilities.semanticTokensProvider = nil
        if client.server_capabilities.inlayHintProvider then
          vim.lsp.inlay_hint.enable(true, { bufnr = args.buf })
        end
      end,
    })
  end,
  event = "BufReadPre",
}

