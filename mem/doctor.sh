#!/bin/sh
# mem — one-screen diagnosis. Prints ~15 lines, not a traceback dump.
V="$HOME/Library/Application Support/Mem/venv/bin/python"
echo "machine   : $(uname -m)  apple-silicon=$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)"
echo "app       : $([ -d /Applications/Mem.app ] && echo yes || echo MISSING)"
if [ -d /Applications/Mem.app ]; then
  echo "launcher  : exec=$(grep -c '^exec' /Applications/Mem.app/Contents/MacOS/Mem) nohup=$(grep -c nohup /Applications/Mem.app/Contents/MacOS/Mem) arch=$(grep -c hw.optional.arm64 /Applications/Mem.app/Contents/MacOS/Mem)"
  grep '^PY=' /Applications/Mem.app/Contents/MacOS/Mem | sed 's/^/points at : /'
fi
if [ -x "$V" ]; then
  echo "python    : $("$V" -c 'import sys,platform;print(sys.version.split()[0], platform.machine())' 2>&1 | head -1)"
  for m in webview numpy aiohttp certifi sounddevice; do
    printf 'import %-12s: %s\n' "$m" "$("$V" -c "import $m" 2>&1 | tail -1 | cut -c1-70 || true)"
    "$V" -c "import $m" 2>/dev/null && printf '\033[1A\033[K%s\n' "import $m: ok"
  done
  echo "models    : $("$V" -m mem models 2>&1 | tail -2 | head -1)"
else
  echo "python    : MISSING — the installer never completed"
fi
echo "--- last log lines ---"
grep -E '^\[mem\]|Error|error -|ModuleNotFound|incompatible architecture|CERTIFICATE' "$HOME/Library/Logs/Mem.log" 2>/dev/null | tail -6
