(setq custom-file (locate-user-emacs-file "custom.el"))
(load custom-file :no-error-if-file-is-missing)

;;; Set up the package manager

(require 'package)
(package-initialize)

(add-to-list 'package-archives '("melpa" . "https://melpa.org/packages/"))

(when (< emacs-major-version 29)
  (unless (package-installed-p 'use-package)
    (unless package-archive-contents
      (package-refresh-contents))
    (package-install 'use-package)))

(add-to-list 'display-buffer-alist
	     '("\\`\\*\\(Warnings\\|Compile-Log\\)\\*\\'"
	       (display-buffer-no-window)
	       (allow-no-window . t)))

;;; Basic behaviour

(setq inhibit-startup-message t)
(setq make-backup-files nil)
(setq auto-save-default nil)
(global-display-line-numbers-mode t)

(setq-default indent-tabs-mode nil)
;(setq-default tab-width 4)
(setq indent-line-function 'insert-tab)

(global-font-lock-mode t)

;;;; Delete the selected text upon text insertion
(use-package delsel
  :ensure nil ; no need to install it as it is built-in
  :hook (after-init . delete-selection-mode))

(defun prot/keyboard-quit-dwim ()
  (interactive)
  (cond
   ((region-active-p)
    (keyboard-quit))
   ((derived-mode-p 'completion-list-mode)
    (delete-completion-window))
   ((> (minibuffer-depth) 0)
    (abort-recursive-edit))
   (t
    (keyboard-quit))))

(define-key global-map (kbd "C-g") #'prot/keyboard-quit-dwin)

;;; Tweak the looks of Emacs

(menu-bar-mode 1)
(scroll-bar-mode 1)
(tool-bar-mode -1)

(let ((mono-spaced-font "Monospace")
      (proportionately-spaced-font "Sans"))
  (set-face-attribute 'default nil :family mono-spaced-font :height 100)
  (set-face-attribute 'fixed-pitch nil :family mono-spaced-font :height 1.0)
  (set-face-attribute 'variable-pitch nil :family proportionately-spaced-font :height 1.0))

;(use-package modus-themes
;  :ensure t
;  :config
;  (load-theme 'modus-vivendi-tinted :no-confirm-loading))

(use-package catppuccin-theme
  :ensure t
  :init
  (setq catppuccin-flavor 'latte)
  :config
  (load-theme 'catppuccin :no-confirm-loading))

(use-package nerd-icons
  :ensure t)

(use-package nerd-icons-completion
  :ensure t
  :after marginalia
  :config
  (add-hook 'marginalia-mode-hook #'nerd-icons-completion-marginalia-setup))

(use-package nerd-icons-corfu
  :ensure t
  :after corfu
  :config
  (add-to-list 'corfu-margin-formatters #'nerd-icons-corfu-formatter))

(use-package nerd-icons-dired
  :ensure t
  :hook
  (dired-mode . nerd-icons-dired-mode))

;;; Configure the minibuffer and completions

(use-package flyspell
  :ensure t
  :config
  (add-hook 'text-mode-hook 'flyspell-mode)
  (add-hook 'prog-mode-hook 'flyspell-prog-mode))

(use-package company
  :ensure t
  :config
  (global-company-mode))

;;;; VERTical Interactive COmpletion
(use-package vertico
  :ensure t
  :hook (after-init . vertico-mode))

;;;; Marginslis in the minibuffer
(use-package marginalia
  :ensure t
  :hook (after-init . marginalia-mode))

;;;; Emacs completion style that matches multiple regexps in any order
(use-package orderless
  :ensure t
  :config
  (setq completion-styles '(orderless basic))
  (setq completion-category-defaults nil)
  (setq completion-category-overrides nil))

;;;; keep a record of user inputs and stores them across sessions
(use-package savehist
  :ensure nil
  :hook (after-init . savehist-mode))

;;;; provide a popup interface for in-buffer completion
(use-package corfu
  :ensure t
  :hook (after-init . global-corfu-mode)
  :bind (:map corfu-map ("<tab>" . corfu-complete))
  :config
  (setq tab-always-indent 'complete)
  (setq corfu-preview-current nil)
  (setq corfu-min-width 20)

  (setq corfu-popupinfo-delay '(1.25 . 0.5))
  (corfu-popupinfo-mode 1) ; shows documentation after `corfu-popupinfo-delay'

  ;; Sort by input history (no need to modify `corfu-sort-function').
  (with-eval-after-load 'savehist
    (corfu-history-mode 1)
    (add-to-list 'savehist-additional-variables 'corfu-history)))

;;; The file manager (Dired)

(use-package dired
  :ensure nil
  :commands (dired)
  :hook
  ((dired-mode . dired-hide-details-mode)
   (dired-mode . hl-line-mode))
  :config
  (setq dired-recursive-copies 'always)
  (setq dired-recursive-deletes 'always)
  (setq delete-by-moving-to-trash t)
  (setq dired-dwim-target t))

(use-package dired-subtree
  :ensure t
  :after dired
  :bind
  ( :map dired-mode-map
    ("<tab>" . dired-subtree-toggle)
    ("TAB" . dired-subtree-toggle)
    ("<backtab>" . dired-subtree-remove)
    ("S-TAB" . dired-subtree-remove))
  :config
  (setq dired-subtree-use-backgrounds nil))

(use-package trashed
  :ensure t
  :commands (trashed)
  :config
  (setq trashed-action-confirmer 'y-or-n-p)
  (setq trashed-use-header-line t)
  (setq trashed-sort-key '("Date deleted" . t))
  (setq trashed-date-format "%Y-%m-%d %H:%M:%S"))

;;; Org

(use-package org
  :ensure nil
  :hook (org-mode . visual-line-mode)
  :config
  (setq org-directory (expand-file-name "~/org/"))
  (setq org-default-notes-file "notes.org")
  (setq org-todo-keywords
	'((sequence "TODO(t)" "PENDING(p)" "|" "DONE(d)" "CANCELED(c)"))))

(use-package org-roam
  :ensure t
  :init
  :custom
  (org-roam-db-location (expand-file-name "~/.emacs.d/org-roam/database.db"))
  (org-roam-directory (expand-file-name "roam" org-directory))
  (org-roam-file-extensions '("org" "md"))
  :bind (("C-c n f" . org-roam-node-find)
	 ("C-c n g" . org-roam-graph)
	 ("C-c n i" . org-roam-node-insert)
	 ("C-c n c" . org-roam-capture))
  :config
  (org-roam-db-autosync-mode))

(use-package org-roam-ui
  :after org-roam
  :ensure t
  :custom
  (org-roam-ui-sync-theme t)
  (org-roam-ui-follow t)
  (org-roam-ui-update-on-save t)
  (org-roam-ui-open-on-start t))


;;; eglot(LSP)

(use-package eglot
  :ensure t
  :hook
  (c++-mode . eglot-ensure)
  :config
  (add-to-list 'eglot-server-peograms '((bitbake-mode) "bitbake-language-server"))
  :bind (("M-t" . xref-find-definitions)
         ("M-r" . xref-find-references)
         ("C-t" . xref-go-back)))
