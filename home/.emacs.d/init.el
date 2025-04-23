(eval-and-compile
  (customize-set-variable
   'package-archives '(("gnu" . "https://elpa.gnu.org/packages/")
		       ("melpa" . "https://melpa.org/packages/")))
  (package-initialize)
  (use-package leaf :ensure t)

  (leaf leaf-keywords
	:ensure t
	:init
	(leaf blackout :ensure t)
	:config
	(leaf-keywords-init)))

(set-language-environment "Japanese")
(prefer-coding-system 'utf-8)
(set-default 'buffer-file-coding-system 'utf-8)

(when (eq system-type 'gnu/linux))
;(let ((key "<f12>"))
;  (require 'mozc)
;  (global-set-key (kbd key) 'toggle-input-method)
;  (define-key mozc-mode-map (kbd key) 'toggle-input-method))
;(setq pgtk-use-im-context-on-new-connection nil)
;(setq default-input-method 'japanese-mozc))

(when (eq system-type 'windows-nt))

(leaf ddskk
  :ensure t
  :bind (("C-x j" . skk-mode)
         ("C-x C-j" . skk-mode))
  :init
  (defvar dired-bind-jump nil)
  :custom
  (skk-use-azik)
  (skk-egg-like-newline)
  )
(setq skk-get-jisyo-directory "~/.emacs.d/skk-get-jisyo")
(setq skk-jisyo (cons (expand-file-name "jisyo" skk-get-jisyo-directory) 'utf-8))
  

(leaf leaf-convert
  :doc "Convert many format to leaf format"
  :ensure t)

(leaf cus-edit
  :doc "tools for customizing Emacs and Lisp packages"
  :custom `((custom-file . ,(locate-user-emacs-file "custom.el"))))

(leaf cus-start
  :doc "define customization properties of builtins"
  :preface
  (defun c/redraw-frame nil
	  (interactive)
	  (redraw-frame))
  :bind (("M-ESC ESC" . c/redraw-frame))
  :custom '((user-login-name . "karunon")
	    (create-lockfiles . nil)
	    (debug-on-error . t)
	    (init-file-debug . t)
	    (frame-resize-pixelwise . t)
	    (enable-recursive-minibuffers . t)
	    (history-length . 1000)
	    (history-delete-duplicates . t)
	    (scroll-preserve-screen-position . t)
	    (scroll-conservtively . 100)
	    (mouse-wheel-scroll-amount . '(1 ((control) . 5)))
	    (ring-bell-function . 'ignore)
	    (text-quoting-style . 'straight)
	    (truncate-lines . t)
	    (use-dialog-box . nil)
	    (use-file-dialog . nil)
	    (menu-bar-mode . t)
	    (tool-bar-mode . nil)
	    (scroll-bar-mode . nil)
	    (indent-tabs-mode . nil))
  :config
  (defalias 'yes-or-no-p 'y-or-n-p)
  (keyboard-translate ?\C-h ?\C-?))

(leaf autorevert
  :doc "revert buffers when files on disk change"
  :global-minor-mode delete-selection-mode)

(leaf delsel
  :doc "delete selection if you insert"
  :global-minor-mode delete-selection-mode)

(leaf paren
  :doc "highlight matching paren"
  :global-minor-mode show-paren-mode)

(leaf simple
  :doc "basic editing commands for Emacs"
  :custom ((kill-read-only-ok . t)
           (kill-whole-line . t)
           (eval-expression-print-length . nil)
           (eval-expression-print-level . nil)))

(leaf files
  :doc "file input and output commands for Emacs"
  :global-minor-mode auto-save-visited-mode
  :custom `((auto-save-file-name-transforms . '((".*", (locate-user-emacs-file "backup/") t)))
            (backup-directory-alist . '((".*" . ,(locate-user-emacs-file "backup"))
                                        (,tramp-file-name-regexp . nil)))
            (version-control . t)
            (delete-old-versions . t)
            (auto-save-visited-interval . 1)))

(leaf startup
  :doc "process Emacs shell arguments"
  :custom `((auto-save-list-file-prefix . ,(locate-user-emacs-file "backup/.saves-"))))

(leaf savehist
  :doc "Save minibuffer history"
  :custom `((savehist-file . ,(locate-user-emacs-file "savehist")))
  :global-minor-mode t)

(leaf flymake
  :doc "A universal on-the-fly syntax checker"
  :bind ((prog-mode-map
          ("M-n" . flymake-goto-next-error)
          ("M-p" . flymake-goto-prev-error))))

(leaf which-key
  :doc "Display available keybindings in popup"
  :ensure t
  :global-minor-mode t)

(leaf exec-path-from-shell
  :doc "Get environment variables such as $PATH from the shell"
  :ensure t
  :defun (exec-path-from-shell-initialize)
  :custom ((exec-path-from-shell-check-startup-files)
           (exec-path-from-shell-variables . '("PATH" "GOPATH" "JAV_HOME")))
  :config
  (exec-path-from-shell-initialize))

(leaf vertico
  :doc "VERTical Interactive COmpletion"
  :ensure t
  :global-minor-mode t)

(leaf marginalia
  :doc "Enrich existing commands with completion annotations"
  :ensure t
  :global-minor-mode t)

(leaf consult
  :doc "Consulting completing-read"
  :ensure t
  :hook (completion-list-mode-hook . consult-preview-at-point-mode)
  :defun consult-line
  :preface
  (defun c/consult-line (&optional at-point)
    "Consult-line uses things-at-point if set C-u prefix."
    (interactive "P")
    (if at-point
        (consult-line (thing-at-point 'symbol))
      (consult-line)))
  :custom ((xref-show-xrefs-function . #'consult-xref)
           (xref-show-definitions-function . #'consult-xref)
           (consult-line-start-from-top . t))
  :bind(;; C-c bindings (mode-specific-map)
        ([remap switch-to-buffer] . consult-buffer) ; C-x b
        ([remap project-switch-to-buffer] . consult-project-buffer) ; C-x p b

        ;; M-g bindings (goto-map)
        ([remap goto-line] . consult-goto-line)
        ([remap imenu] . consult-imenu)
        ("M-g f" . consult-flymake)

        ;; C-M-s bindings
        ("C-s" . c/consult-line)
        ("C-M-s" . nil)
        ("C-M-s s" . isearch-forward)
        ("C-M-s C-s" . isearch-forward-regexp)
        ("C-M-s r" . consult-ripgrep)

        (minibuffer-local-map
         :package emacs
         ("C-r" . consult-history))))

(leaf affe
  :doc "Asynchronous Fuzzy Finder for Emacs"
  :ensure t
  :custom ((affe-highlight-function . 'orderless-highlight-matches)
           (affe-regexp-function . 'orderless-pattern-compiler))
  :bind (("C-M-s r" . affe-grep)
         ("C-M-s f" . affe-find)))

(leaf orderless
  :doc "Completion style for matching regexps in any order"
  :ensure t
  :custom ((completion-styles . '(orderless))
           (completion-category-defaults . nil)
           (completion-category-overrides . '((file (styles partial-completion))))))

(leaf embark-consult
  :doc "Consult integration for Embark"
  :ensure t
  :bind ((minibuffer-mode-map
          :package emacs
          ("M-." . embark-dwim)
          ("C-." . embark-act))))

(leaf corfu
  :doc "COmpletion in Region FUnction"
  :ensure t
  :global-minor-mode global-corfu-mode corfu-popupinfo-mode
  :custom ((corfu-auto . t)
           (corfu-auto-delay . 0)
           (corfu-auto-prefix . 1)
           (corfu-popupinfo-delay . nil))
  :bind ((corfu-map
          ("C-s" . corfu-insert-separator))))

(leaf cape
  :doc "Completion At Point Extensions"
  :ensure t
  :config
  (add-to-list 'completion-at-point-functions #'cape-file))

(leaf eglot
  :doc "The Emacs Client for LSP servers"
  :hook ((clojure-mode-hook . eglot-ensure)
         (rust-mode-hook . eglot-ensure))
  :custom ((eldoc-echo-area-use-multiline-p . nil)
           (eglot-connect-timeout . 600)))

(leaf eglot-booster
  :when (executable-find "emacs-lsp-booster")
  :vc ( :url "https://github.com/jdtsmith/eglot-booster")
  :global-minor-mode t)

(leaf puni
  :doc "Parentheses Universalistic"
  :ensure t
  :global-minor-mode puni-global-mode
  :bind (puni-mode-map
         ("C-)" . puni-slurp-forward)
         ("C-}" . puni-barf-forward)
         ("M-(" . puni-wrap-round)
         ("M-s" . puni-splice)
         ("M-r" . puni-raise)
         ("M-U" . puni-splice-killing-backward)
         ("M-z" . puni-squeeze))
  :config
  (leaf elec-pair
    :doc "Automatic parenthesis pairing"
    :global-minor-mode electric-pair-mode))

;; Org

(leaf org
  :bind (("C-c c" . org-capture)
         ("C-c a" . org-agenda)
         ("C-c l" . org-store-link)
         ("C-c ." . org-time-stamp)
         ("C-c C-t" . org-todo)))
(leaf org-roam
  :bind (("C-c n l" . org-roam)
         ("C-c n f" . org-roam-find-file)
         ("C-c n g" . org-roam-graph-show)
         ("C-c n i" . org-roam-insert)))
;(add-hook 'after-init-hook 'org-roam-mode)
(org-roam-db-autosync-mode)
(leaf org-beautify-theme
  :ensure t)
(leaf org-download
  :ensure t)
(leaf org-journal
  :ensure t
  :bind ("C-c j" . org-journal-new-entry))

(setq org-directory "~/org")
(setq org-default-notes-file "notes.org")
(setq org-capture-templates
      '(("n" "Note" entry (file+headline "~/org/notes.org" "Notes")
         "* %?\nEntered on %U\n %i\n %a)")))
(setq-default org-download-image-dir "~/org/pictures")
(setq org-roam-db-location "~/.emacs.d/org-roam.db")
;(setq org-roam-directory "~/org/org-roam/docs")
;(setq org-roam-index-file "~/org/org-roam/docs/index.org")
(setq org-startup-truncated nil)
(setq org-todo-keywords
      '((sequence "TODO(t)" "DOIN(n)" "|" "DONE(d)" "KILL(k)")))
(setq org-log-done 'time)
(setq org-journal-dir "~/org/journal")
(setq org-journal-date-format "%A, %d %B %Y")
(setq org-journal-file-format "%Y%m%d.org")

(org-roam-setup)

(defun show-org-buffer (file)
  :doc "Show an org-file FILE on the current buffer."
  (interactive)
  (if (get-buffer file)
      (let ((buffer (get-buffer file)))
        (switch-to-buffer buffer)
        (message "%s" file))
    (find-file (concat "~/org/" file))))
(global-set-key (kbd "C-M-^") '(lambda () (interactive)
                                 (show-org-buffer "notes.org")))

(leaf vim-jp-radio
  :vc ( :url "https://github.com/vim-jp-radio/vim-jp-radio.el"))

;; TODO: change evil to meow

(leaf evil
  :ensure t
  :config
  (setq evil-want-C-u-scroll t)
  (evil-mode 1))
