#!/bin/zsh -l
# Double-click to start CopyPastePilot. Needs Node.js (https://nodejs.org).
# Doppelklick startet CopyPastePilot. Braucht Node.js (https://nodejs.org).
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
echo "Starting CopyPastePilot. Do not close this window while you use it."
echo "CopyPastePilot wird gestartet. Dieses Fenster nicht schließen, solange du es nutzt."
echo
if ! command -v npx >/dev/null 2>&1; then
  echo "Node.js was not found. Please install it from https://nodejs.org and start again."
  echo "Node.js wurde nicht gefunden. Bitte von https://nodejs.org installieren und dann nochmal starten."
else
  npx --yes copypastepilot@latest
fi
echo
echo "CopyPastePilot has ended. You can close this window. / CopyPastePilot wurde beendet. Du kannst dieses Fenster schließen."
read -r "?Press Enter to close / Enter drücken zum Schließen …"
