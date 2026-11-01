# James Mahoney's terminal portfolio

A static, Fallout-inspired portfolio for GitHub Pages. There is no build step or
runtime dependency to install.

## Preview

From the repository root:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000/>. Use an HTTP server so fonts and audio load normally.

## Checks

With Node.js 22 or newer:

```sh
node scripts/check.cjs
```

This checks JavaScript syntax and runs the tests using Node's built-in test runner.
It needs no package installation. The same command runs on GitHub Actions for
pushes and pull requests.

Before merging visual changes, also check desktop and phone widths, a first-visit
boot, a return-visit wake, navigation, scrolling, power cycling and sound muting.
Check the HTML fallback when WebGL or JavaScript is unavailable.

## Files and behaviour

- `index.html`: portfolio content, navigation, controls and audio sources.
- `style.css`: monitor casing, terminal layout and responsive styles.
- `terminal.js`: power, boot/wake, navigation, typing and scrolling.
- `crt.js`: optional WebGL renderer; HTML remains the source for layout and links.
- `sound.js`: optional sound effects and the mute control.

First visits run the BIOS and welcome screens. Later visits use a short wake-up
and show the requested section immediately. The POWER button replays the full
boot. Click the screen or press a key to skip a boot; modifier keys, Tab and the
sound switch leave it running.

Sound begins after a user interaction. The browser stores the completed-visit
flag (`robco-visited`) and sound preference (`robco-sound`) locally. Blocked
storage or audio does not prevent access. Logon text uses the browser's time zone;
there is no IP lookup or analytics request.

## Publishing

Serve the repository root with GitHub Pages. No generated files are required.
The check workflow validates changes and does not deploy the site.

When changing published CSS or JavaScript, bump the shared asset version in
`index.html` so returning browsers fetch the updated files.

## Asset credits

- Sound effects: Kenney, CC0. Sources and the included licence are in
  [audio/README.md](audio/README.md).
- Fixedsys Excelsior: originally by Darien Valentine. The bundled WOFF2 is a
  Latin subset of the font previously used by this site. See the
  [Fixedsys distribution terms](https://github.com/kika/fixedsys#distribution-terms).
