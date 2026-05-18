-- Nothing OS — UI plugin overrides (mono palette, Ndot markers)

local mono = {
  bg     = "#000000",
  bg_alt = "#0a0a0a",
  bg_hi  = "#1a1a1a",
  fg     = "#ffffff",
  dim    = "#a8a8a8",
  mute   = "#6e6e6e",
  err    = "#d72631",
}

return {
  -- lualine: mono status
  {
    "nvim-lualine/lualine.nvim",
    opts = function(_, opts)
      local mono_theme = {
        normal = {
          a = { fg = mono.bg, bg = mono.fg, gui = "bold" },
          b = { fg = mono.fg, bg = mono.bg_hi },
          c = { fg = mono.dim, bg = mono.bg_alt },
        },
        insert  = { a = { fg = mono.bg, bg = mono.fg, gui = "bold" } },
        visual  = { a = { fg = mono.bg, bg = mono.dim, gui = "bold" } },
        replace = { a = { fg = mono.bg, bg = mono.err, gui = "bold" } },
        command = { a = { fg = mono.bg, bg = mono.fg, gui = "bold" } },
        inactive = {
          a = { fg = mono.mute, bg = mono.bg_alt },
          b = { fg = mono.mute, bg = mono.bg_alt },
          c = { fg = mono.mute, bg = mono.bg_alt },
        },
      }
      opts.options = opts.options or {}
      opts.options.theme = mono_theme
      opts.options.component_separators = { left = "▪", right = "▪" }
      opts.options.section_separators   = { left = "", right = "" }
      opts.options.globalstatus = true
      return opts
    end,
  },

  -- bufferline: mono tabs, hairline separators
  {
    "akinsho/bufferline.nvim",
    opts = function(_, opts)
      opts.options = opts.options or {}
      opts.options.separator_style = { "│", "│" }
      opts.options.show_buffer_close_icons = false
      opts.options.show_close_icon = false
      opts.options.indicator = { style = "underline" }
      opts.highlights = {
        fill                = { bg = mono.bg },
        background          = { fg = mono.mute, bg = mono.bg_alt },
        buffer_visible      = { fg = mono.dim,  bg = mono.bg_alt },
        buffer_selected     = { fg = mono.fg,   bg = mono.bg, bold = true },
        modified            = { fg = mono.dim,  bg = mono.bg_alt },
        modified_visible    = { fg = mono.fg,   bg = mono.bg_alt },
        modified_selected   = { fg = mono.fg,   bg = mono.bg },
        duplicate           = { fg = mono.mute, bg = mono.bg_alt, italic = true },
        duplicate_selected  = { fg = mono.dim,  bg = mono.bg,     italic = true },
        separator           = { fg = mono.bg_hi, bg = mono.bg_alt },
        separator_selected  = { fg = mono.bg_hi, bg = mono.bg },
        separator_visible   = { fg = mono.bg_hi, bg = mono.bg_alt },
        indicator_selected  = { fg = mono.fg, bg = mono.bg },
        offset_separator    = { fg = mono.bg_hi, bg = mono.bg },
        numbers_selected    = { fg = mono.fg, bg = mono.bg, bold = true },
      }
      return opts
    end,
  },

  -- notify: mono
  {
    "rcarriga/nvim-notify",
    opts = {
      background_colour = mono.bg,
      stages = "static",
      timeout = 2500,
      max_width = 60,
      fps = 30,
      icons = { ERROR = "●", WARN = "●", INFO = "▪", DEBUG = "▫", TRACE = "·" },
    },
  },

  -- neo-tree: minimal symbols
  {
    "nvim-neo-tree/neo-tree.nvim",
    opts = {
      default_component_configs = {
        indent = {
          indent_marker = "│",
          last_indent_marker = "└",
          highlight = "NeoTreeIndentMarker",
        },
        icon = {
          folder_closed = "▸",
          folder_open   = "▾",
          folder_empty  = "·",
          default       = "▪",
        },
        modified = { symbol = "●", highlight = "NeoTreeGitModified" },
        git_status = {
          symbols = {
            added     = "+",
            modified  = "~",
            deleted   = "-",
            renamed   = "»",
            untracked = "?",
            ignored   = "·",
            unstaged  = "·",
            staged    = "■",
            conflict  = "!",
          },
        },
      },
      window = { width = 32 },
    },
  },

  -- which-key: mono icons + no nerd-font dependency for labels
  {
    "folke/which-key.nvim",
    opts = {
      icons = {
        breadcrumb = "›",
        separator  = "·",
        group      = "▪ ",
      },
      win = { border = "single" },
    },
  },

  -- noice: single border, mono cmdline
  {
    "folke/noice.nvim",
    opts = {
      presets = {
        bottom_search   = true,
        command_palette = true,
        long_message_to_split = true,
        inc_rename      = false,
        lsp_doc_border  = true,
      },
    },
  },
}
