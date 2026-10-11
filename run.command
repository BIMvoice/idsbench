#!/bin/bash
# Double-click to launch idsbench (macOS).
# Starts the local engine and opens it in your browser. Close this window to stop.
cd "$(dirname "$0")" || exit 1

if curl -s http://127.0.0.1:5005 >/dev/null 2>&1; then
  open "http://127.0.0.1:5005"
  exit 0
fi

echo "Starting idsbench..."
echo "Keep this window open while you use the tool. Close it to stop."
( sleep 2; open "http://127.0.0.1:5005" ) &

# Prefer a local virtualenv if present, otherwise system python3.
if [ -x ".venv/bin/python" ]; then
  exec .venv/bin/python app.py
else
  exec python3 app.py
fi
