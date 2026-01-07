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
    "hrsh7th/cmp-nvim-lsp",
  },
  lazy = false, -- Load immediately to ensure lsp/ configs are in runtimepath
  priority = 50, -- Load before other plugins
  config = function()
    local server_list = {
      "rust_analyzer",
      "lua_ls",
      "nil_ls",
    }

    -- Shared capabilities for all language servers
    local capabilities = vim.tbl_deep_extend(
      "force",
      vim.lsp.protocol.make_client_capabilities(),
      require("cmp_nvim_lsp").default_capabilities()
    )

    -- Configure each language server using vim.lsp.config()
    -- Only override specific settings, let nvim-lspconfig handle defaults (filetypes, root_markers, cmd)
    vim.lsp.config('lua_ls', {
      capabilities = capabilities,
      settings = {
        Lua = {
          diagnostics = {
            globals = { "vim" },
          },
        },
      },
    })

    vim.lsp.config('rust_analyzer', {
      capabilities = capabilities,
      settings = {
        ['rust-analyzer'] = {
          diagnostics = {
            enable = false,
          },
        },
      },
    })

    vim.lsp.config('nil_ls', {
      capabilities = capabilities,
    })

    -- Enable language servers
    if vim.fn.executable("home-manager") then
      -- Home Manager environment: enable manually
      for _, server in ipairs(server_list) do
        vim.lsp.enable(server)
      end
    else
      -- Mason environment: setup mason and enable automatically
      require("mason").setup {
        ui = {
          check_outdated_packages_on_open = false,
        },
        PATH = "append",
      }

      require("mason-lspconfig").setup {
        ensure_installed = server_list,
        automatic_enable = true, -- Automatically call vim.lsp.enable() for installed servers
      }
    end

    -- Configure global diagnostic display
    vim.diagnostic.config({
      virtual_text = {
        source = true,
      },
    })

    -- Helper function to show definition/references in quickfix list
    local function on_list(options)
      vim.fn.setqflist({}, " ", options)
      vim.api.nvim_command("cfirst")
    end

    -- Set up keymappings and settings when LSP attaches to a buffer
    vim.api.nvim_create_autocmd("LspAttach", {
      callback = function(args)
        local client = vim.lsp.get_client_by_id(args.data.client_id)
        if not client then
          return
        end

        -- Disable semantic tokens
        client.server_capabilities.semanticTokensProvider = nil

        -- Enable inlay hints if supported
        if client.server_capabilities.inlayHintProvider then
          vim.lsp.inlay_hint.enable(true, { bufnr = args.buf })
        end

        -- Set up buffer-local keymappings
        local opts = { buffer = args.buf, silent = true }
        vim.keymap.set("n", "gd", function()
          vim.lsp.buf.definition({ on_list = on_list })
        end, opts)
        vim.keymap.set("n", "gr", function()
          vim.lsp.buf.references(nil, { on_list = on_list })
        end, opts)
        vim.keymap.set("n", "K", vim.lsp.buf.hover, opts)
        vim.keymap.set("n", "<leader>rn", vim.lsp.buf.rename, opts)
        vim.keymap.set("n", "<leader>ca", vim.lsp.buf.code_action, opts)
      end,
    })
  end,
}

