#!/bin/sh
# mem — installer.
#
#   curl -fsSL https://<your-domain>/mem/install.sh | sh
#
# WHY A SCRIPT AND NOT A .DMG
# ---------------------------
# macOS sets com.apple.quarantine on anything a BROWSER downloads, and an app
# carrying it is refused by Gatekeeper unless it has been notarised — which
# needs a paid Apple Developer ID. Since Sequoia there is no Control-click
# escape either; the way through is System Settings, Privacy & Security, Open
# Anyway. Five steps and a frightening dialog.
#
# curl sets no such attribute, and neither does a bundle BUILT on the machine
# it will run on. So this installs, then builds the .app locally, and the icon
# in Launchpad is one macOS never has to assess. That is not a trick to dodge
# the fee; it is the reason none is owed.
#
# WHAT IT TOUCHES, AND NOTHING ELSE
#   ~/Library/Application Support/Mem/venv    its own Python environment
#   ~/.mem-voice/models                        365 MB of speech models
#   ~/Applications/Mem.app                     the icon
#
# No sudo. Nothing is written outside your home directory. Uninstall is three
# `rm -rf`s, printed at the end.

set -eu

# ---- the two things you may want to override ------------------------------
# Where the package comes from. Point at a PyPI name once it is published; a
# source tarball until then. Overridable so a fork or a release candidate can
# be tested without editing this file.
MEM_SRC="${MEM_SRC:-https://saivinay.me/mem/mem-latest.tar.gz}"
PREFIX="${MEM_PREFIX:-$HOME/Library/Application Support/Mem}"

APP_NAME="Mem"
MIN_PY_MINOR=10

# ---- output ---------------------------------------------------------------
# Colour only when this is a terminal. Piped into a file or a CI log, escape
# codes are noise that makes the failure harder to read, not easier.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  B=$(printf '\033[1m'); Y=$(printf '\033[33m'); R=$(printf '\033[31m')
  D=$(printf '\033[2m'); Z=$(printf '\033[0m')
else
  B=''; Y=''; R=''; D=''; Z=''
fi

say()  { printf '  %s\n' "$*"; }
ok()   { printf '  %s✓%s %s\n' "$Y" "$Z" "$*"; }
step() { printf '  %s·%s %s\n' "$D" "$Z" "$*"; }
die()  { printf '\n  %s✗ %s%s\n\n' "$R" "$*" "$Z" >&2; exit 1; }

printf '\n  %smem%s  ·  a model of you that any agent can read\n\n' "$B" "$Z"

# ---- 1. is this even a Mac ------------------------------------------------
OS="$(uname -s)"
if [ "$OS" != "Darwin" ]; then
  say "This installs the macOS app. On $OS the memory half works fine:"
  say ""
  say "    pip install \"mem[voice]\" && mem models --fetch && mem voice"
  say ""
  exit 1
fi

# ---- 2. a Python new enough ----------------------------------------------
# Checked BEFORE anything is created, so a machine that cannot run this ends
# up with nothing rather than a half-built directory.
PY=""
for candidate in python3.13 python3.12 python3.11 python3.10 python3; do
  p="$(command -v "$candidate" 2>/dev/null || true)"
  [ -n "$p" ] || continue
  # `/usr/bin/python3` on a Mac without the Command Line Tools is a stub that
  # pops a GUI installer and exits non-zero. Redirect it away and treat the
  # failure as "not here", which is what it means.
  v="$("$p" -c 'import sys; print(sys.version_info[1] if sys.version_info[0]==3 else 0)' 2>/dev/null || echo 0)"
  if [ "$v" -ge "$MIN_PY_MINOR" ] 2>/dev/null; then PY="$p"; break; fi
done

if [ -z "$PY" ]; then
  printf '\n  %sNo Python 3.%s or newer.%s\n\n' "$R" "$MIN_PY_MINOR" "$Z"
  say "macOS does not ship one. Either is fine:"
  say ""
  say "    xcode-select --install        # Apple's, a few minutes"
  say "    brew install python@3.12      # if you have Homebrew"
  say ""
  say "Then run this again."
  exit 1
fi
ok "python $("$PY" -c 'import sys;print("%d.%d"%sys.version_info[:2])') — $PY"

# ---- 3. a coding agent to drive -------------------------------------------
# Not fatal. The vault and the window are useful before an agent is wired, and
# refusing to install because `claude` is missing would be this script deciding
# something that is not its business. But say it now rather than letting the
# first empty window be the message.
AGENTS=""
for a in claude codex gemini; do
  command -v "$a" >/dev/null 2>&1 && AGENTS="$AGENTS $a"
done
if [ -n "$AGENTS" ]; then
  ok "found:$AGENTS"
else
  printf '  %s!%s no coding agent on PATH yet — install Claude Code, Codex\n' "$Y" "$Z"
  printf '      or Gemini CLI and mem will wire itself into it.\n'
fi

# ---- 4. its own environment ------------------------------------------------
# A virtualenv of its own, not the system Python and not --user. This installs
# onnxruntime, numpy and ctranslate2; putting those into whatever interpreter
# happened to be first on PATH is how you break somebody else's project.
step "making a place for it in $PREFIX"
mkdir -p "$PREFIX" || die "cannot write to $PREFIX"
VENV="$PREFIX/venv"

if [ ! -x "$VENV/bin/python" ]; then
  "$PY" -m venv "$VENV" 2>/dev/null || die "could not create a virtualenv.
      Try: $PY -m ensurepip --upgrade"
fi
ok "environment ready"

step "installing mem (this pulls onnxruntime and pywebview, ~2 minutes)"
"$VENV/bin/python" -m pip install --quiet --upgrade pip >/dev/null 2>&1 || true
# The extras marker has to ride along with the URL, hence the `mem[voice,gui] @`
# form, which is how PEP 508 spells "this distribution, with these extras".
# BOTH EXTRAS, AND `gui` IS THE ONE THAT MAKES A WINDOW EXIST.
#
# `voice` is the microphone and the speech models. `gui` is pywebview, which is
# what actually opens a desktop window. Installing only `voice` produces an app
# that starts perfectly, serves its UI on localhost, and never shows anything:
# cli.py falls back to printing a URL, which in a GUI launch goes to a log file
# nobody is reading. A tester saw the Dock icon bounce, got the macOS
# permission prompts -- because the process really had started -- and then
# nothing at all. That is this line.
if printf '%s' "$MEM_SRC" | grep -q '://'; then
  SPEC="mem[voice,gui] @ $MEM_SRC"
else
  SPEC="$MEM_SRC[voice,gui]"
fi
# --no-cache-dir IS LOAD-BEARING, NOT TIDINESS.
#
# pip keys its wheel cache on a distribution's NAME AND VERSION, not on the
# bytes it was built from. Two different tarballs both called mem-0.1.0 are the
# same entry, so pip happily rebuilds nothing and installs the wheel it made
# from the FIRST one -- while the fresh download sits there unused. Caught by a
# live re-run: the tarball on the server had a fix, the installed copy did not,
# and there was no error anywhere to say so.
#
# For a one-shot install the cache buys nothing and costs exactly this, so it
# is off. (Bumping the version every release fixes it too, and should also
# happen -- but an installer must not depend on a human remembering.)
"$VENV/bin/python" -m pip install --quiet --no-cache-dir --upgrade "$SPEC" \
  || die "could not install from:
      $MEM_SRC
    If that address is wrong, set MEM_SRC and run this again."
ok "mem installed"

# ---- 5. the speech models --------------------------------------------------
# The step whose absence made every install but the author's come up with a
# dead microphone and no error. It is 365 MB and it happens HERE, with a
# progress bar, rather than silently inside the first held space bar.
step "speech models"
if ! "$VENV/bin/python" -m mem models --fetch --whisper; then
  printf '  %s!%s the models did not all download. Nothing else is broken —\n' "$Y" "$Z"
  printf '      open Mem, go to Setup, and press Get them. It resumes.\n'
fi

# ---- 6. the icon -----------------------------------------------------------
# PRINT THE PATH IT ACTUALLY USED, not the one this script guesses at.
#
# This used to swallow the output and print "~/Applications" from a string
# here. A tester then could not find the app -- because Finder's Applications
# sidebar item is /Applications, a different folder, and the one this script
# had named was brand new, in no sidebar, and not yet indexed by Launchpad.
# The install had worked perfectly and looked like it had not.
step "building the app"
# MEM_APP_TO exists so this can be exercised without replacing a real
# /Applications/Mem.app -- which is exactly what happened twice while testing
# this script, to the machine it was being written on.
if [ -n "${MEM_APP_TO:-}" ]; then
  APP_ARGS="--no-reveal --to $MEM_APP_TO"
else
  APP_ARGS="--no-reveal"
fi
APP_PATH="$("$VENV/bin/python" -m mem app $APP_ARGS 2>/dev/null \
            | sed -n 's/^installed //p')"
if [ -n "$APP_PATH" ]; then
  ok "$APP_PATH"
else
  printf '  %s!%s could not build the app. `%s/bin/mem voice` still works.\n' \
    "$Y" "$Z" "$VENV"
fi

# ---- 7. a `mem` on PATH, if there is somewhere obvious to put it -----------
# A symlink, not a PATH edit. Rewriting somebody's shell profile from a piped
# installer is the kind of thing that earns a tool a reputation.
if [ -d "$HOME/.local/bin" ]; then
  ln -sf "$VENV/bin/mem" "$HOME/.local/bin/mem" 2>/dev/null \
    && ok "\`mem\` on your PATH (~/.local/bin)"
fi

if [ -n "$APP_PATH" ]; then
  printf '\n  %sDone.%s %s\n' "$B" "$Z" "$APP_PATH"
  # A literal glyph, not \u2318: POSIX printf does not expand \u escapes and
  # bash's builtin printed it verbatim on the first live run.
  printf '  Press %s⌘ Space%s and type Mem, or open it from the folder above.\n\n' "$B" "$Z"
else
  printf '\n  %sDone.%s Run: %s\n\n' "$B" "$Z" "$VENV/bin/mem voice"
fi
say "${D}first launch${Z}"
say "  macOS asks for the microphone once — that is the space bar."
say "  Then Setup runs itself: it reads the coding sessions already on"
say "  this machine and wires the result into every agent you have."
printf '\n'
say "${D}uninstall${Z}"
say "  rm -rf \"$PREFIX\" ~/.mem-voice \"${APP_PATH:-$HOME/Applications/$APP_NAME.app}\""
printf '\n'
