local wezterm = require 'wezterm'
local config = {}

config.font = wezterm.font 'UDEV Gothic NFLG'
config.window_background_opacity = 0.7 -- opacity as you please
config.kde_window_background_blur = true
config.enable_kitty_keyboard = true

return config
