(when (boundp 'native-comp-eln-load-path)
  (startup-redirect-eln-cache
   (expand-file-name "~/.local/share/emacs/eln-cache/")))

(with-eval-after-load 'comp
  (setopt native-comp-async-jobs-number 8
          native-comp-speed 1
          native-comp-always-compile t))

(with-eval-after-load 'warnings
  (setopt warning-suppress-types '((comp))))

