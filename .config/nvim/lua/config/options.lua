-- Options are automatically loaded before lazy.nvim startup

-- Nothing rice — GUI font (used by neovide / nvim-qt; tty inherits terminal)
vim.opt.guifont = "JetBrainsMono Nerd Font:h13:l"

-- Mono UI feel
vim.opt.fillchars = {
  vert      = "│",
  horiz     = "─",
  horizup   = "┴",
  horizdown = "┬",
  vertleft  = "┤",
  vertright = "├",
  verthoriz = "┼",
  eob       = " ",
  fold      = "·",
  foldopen  = "▾",
  foldclose = "▸",
  foldsep   = "│",
  diff      = "·",
  msgsep    = "─",
}

vim.opt.listchars = {
  tab      = "▸ ",
  trail    = "·",
  nbsp     = "␣",
  extends  = "›",
  precedes = "‹",
}

vim.opt.cursorline   = true
vim.opt.cursorlineopt = "number,line"
vim.opt.signcolumn   = "yes"
vim.opt.scrolloff    = 4
vim.opt.sidescrolloff = 8
vim.opt.pumblend     = 0
vim.opt.winblend     = 0
vim.opt.termguicolors = true
