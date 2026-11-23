# CopyPastePilot

**English** · [Deutsch](README.de.md)

Copies fields from one program window into another. It runs only on your computer and reads windows through the
operating system's accessibility features (using [agent-desktop](https://www.npmjs.com/package/agent-desktop)).
No more retyping data from a mail into a form, from a spreadsheet into a customer program, or across several pages.

## Quick start for beginners

All you need is **Node.js**. CopyPastePilot fetches everything else itself.

**1. Install Node.js (once).** Download the "LTS" version from https://nodejs.org and install it with the default
settings. Then **reopen** your terminal.

**2. Start CopyPastePilot.** Open a terminal (Windows: Start menu → "PowerShell"; macOS: Applications → Utilities →
"Terminal") and type:

```bash
npx copypastepilot
```

The first run downloads a few things, then CopyPastePilot opens in your browser. Keep the terminal window open while you
use it. Press Ctrl+C or close the window to stop. Always open the address shown in the terminal; it contains an access
token.

**Even easier, without a terminal:** download `CopyPastePilot-starten.bat` (Windows) or `CopyPastePilot-starten.command`
(macOS) from the [`start`](start) folder and double-click it. It always starts the latest version. On macOS, right-click →
"Open" the first time, because the file is not signed.

**Something not working?** This command shows what is missing (Node version, agent-desktop, permissions):

```bash
npx copypastepilot --check
```

**Optional: install permanently.** Then the command `copypastepilot` is enough from now on:

```bash
npm install -g copypastepilot
copypastepilot
```

To update: `npm install -g copypastepilot@latest`. The source code is on
[GitHub](https://github.com/andreas-david/copypastepilot).

### Permissions on macOS

On the first start, two permissions are needed (System Settings → Privacy & Security), each for the program you started
CopyPastePilot from (usually the terminal):

- **Accessibility:** to read and fill the fields.
- **Screen & System Audio Recording:** only so macOS hands out window titles. Without it you see the program name instead
  of the title, and windows cannot be recognized. The program does not record the screen.

After granting them, restart the terminal program and CopyPastePilot. Help: `npx agent-desktop permissions --guide`.

### Notes for Windows

- If agent-desktop is not found, `npm install -g agent-desktop` helps. CopyPastePilot then finds it on the `PATH`
  itself. You can also point to a file directly with the `AGENT_DESKTOP` environment variable.
- If the folder for global npm programs is not on your `PATH`, `npx` still works. That is the safe way.

## Several pages (steps)

A configuration can consist of several steps, for example for a form with a "Next" button. Each step has its own target
and its own field pairs. When running, one step follows the other: you run step 1, look at the filled-in form, click
"Next" there yourself, and only then start step 2 in the tool. When setting up, you choose the source on the left and the
target on the right, click "Load fields" and map them. You create step 2 after clicking "Next" in the target yourself.
For each step you can add a note that is shown after that step.

## Appearance and language

At the top right you choose the language (German or English) and between Automatic (follows the system), Light and Dark.
The choice is remembered in the browser. Without a choice, the interface uses the browser's language. The terminal follows
the system language; change it with `--lang de` or `--lang en`, or with the environment variable `COPYPASTEPILOT_LANG`.

## Windows and tabs

In browsers (tested: Chrome, Safari, Firefox) every tab is listed separately. Only the front tab of a window is
readable. That is why CopyPastePilot briefly brings a background tab to the front for reading, checking and writing, and
then restores the previous tab. If CopyPastePilot and the target are in the same browser window, the view jumps briefly.
Additions to the tab name such as "– Memory usage – 12 MB" are removed. Finding a window again works through
"Title contains …".

## Where are the configurations stored?

One JSON file per configuration in `~/.copypastepilot/configs/`. You can back them up or share them. A different folder
can be set with `COPYPASTEPILOT_HOME`. Texts you write yourself (names, help, notes) are not translated.

## Privacy

- Everything stays on this computer. Field contents are neither stored nor sent.
- Password fields are never read.
- The server listens only on `127.0.0.1` and requires the token.
- Update notice: the program asks the npm registry for the latest version at most every six hours (no user data).
  Turn it off with `COPYPASTEPILOT_NO_UPDATE_CHECK=1`.

## Development

The built interface (`web-dist/`) is also in the repository. `npm publish` rebuilds it automatically first.
All texts live in `locales/de.js` and `locales/en.js`. A new language is one more file with the same keys (`npm test`
checks that).

```bash
npm install
npm run build   # builds the interface into web-dist/
npm test
npm start
```

## Help and contact

Questions or problems? See [www.digitaldavid.de/copypastepilot](https://www.digitaldavid.de/copypastepilot) or report an
issue on [GitHub](https://github.com/andreas-david/copypastepilot/issues). For startup problems, the output of
`npx copypastepilot --check` helps.

## License

MIT, see [LICENSE](LICENSE). CopyPastePilot uses [agent-desktop](https://www.npmjs.com/package/agent-desktop)
(Apache-2.0).
