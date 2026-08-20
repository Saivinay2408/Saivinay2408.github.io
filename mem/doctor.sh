#!/bin/sh
# mem — one-screen diagnosis. Answers "is this even the current build" first,
# because three separate fixes looked broken when the real answer was that the
# machine was still running the old one.
V="$HOME/Library/Application Support/Mem/venv/bin/python"
echo "machine   : $(uname -m)  apple-silicon=$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)"

if [ -x "$V" ]; then
  HAVE=$("$V" -c 'from mem._build import BUILD; print(BUILD)' 2>/dev/null || echo "none")
else
  HAVE="not installed"
fi
WANT=$(curl -fsSL "https://saivinay.me/mem/BUILD?cb=$$" 2>/dev/null || echo "?")
echo "build     : installed=$HAVE  published=$WANT"
[ "$HAVE" = "$WANT" ] && echo "            ^ up to date" \
                      || echo "            ^ MISMATCH — re-run the installer"

if [ -d /Applications/Mem.app ]; then
  echo "launcher  : exec=$(grep -c '^exec' /Applications/Mem.app/Contents/MacOS/Mem) nohup=$(grep -c nohup /Applications/Mem.app/Contents/MacOS/Mem) arch=$(grep -c hw.optional.arm64 /Applications/Mem.app/Contents/MacOS/Mem)"
else
  echo "launcher  : Mem.app MISSING"
fi
echo "running   : $(pgrep -f 'mem voice' | wc -l | tr -d ' ') process(es)"

if [ -x "$V" ]; then
  echo "python    : $("$V" -c 'import sys,platform;print(sys.version.split()[0], platform.machine())' 2>&1 | head -1)"
  echo "pip       : $("$V" -m pip --version 2>&1 | awk '{print $2}')"
  for m in webview numpy certifi sounddevice; do
    if "$V" -c "import $m" 2>/dev/null; then echo "import $m: ok"
    else echo "import $m: FAILED"; fi
  done
  echo "https     : $("$V" -c 'import ssl,urllib.request,certifi;urllib.request.urlopen("https://github.com",timeout=15,context=ssl.create_default_context(cafile=certifi.where()));print("ok")' 2>&1 | tail -1 | cut -c1-60)"
  echo "models    : $("$V" -m mem models 2>&1 | tail -2 | head -1)"
fi
echo "--- log ---"
grep -E '^\[mem\]|error -|ModuleNotFound|incompatible architecture|CERTIFICATE' "$HOME/Library/Logs/Mem.log" 2>/dev/null | tail -5
