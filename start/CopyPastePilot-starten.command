#!/bin/zsh -l
# Doppelklick startet CopyPastePilot. Braucht Node.js (https://nodejs.org).
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
echo "CopyPastePilot wird gestartet. Dieses Fenster nicht schließen, solange du CopyPastePilot nutzt."
echo
if ! command -v npx >/dev/null 2>&1; then
  echo "Node.js wurde nicht gefunden. Bitte von https://nodejs.org installieren und dann nochmal starten."
else
  npx --yes copypastepilot@latest
fi
echo
echo "CopyPastePilot wurde beendet. Du kannst dieses Fenster schließen."
read -r "?Enter drücken zum Schließen …"
