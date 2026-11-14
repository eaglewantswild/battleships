# Standalone Battleship — source code and deployment guide

A browser-based Battleship game with a hidden image gradually uncovered by
successful hits. This is a **self-contained website**: it has its own HTML,
CSS, JavaScript, configuration and example graphics. There are no external
libraries, fonts, trackers, PHP endpoints or absolute paths.

**The alternate secret-shot/coordinate-pattern puzzle has been removed.** The
only way to finish the game is to sink all five enemy ships. On victory, the
complete signal image is displayed in a popup. A normal loss does not reveal
it.

## 1. Quick start

1. Unzip `battleship-standalone.zip`.
2. Copy the **entire** `battleship-standalone` folder into any web-accessible
   location, e.g. `public_html/games/battleship/`. Do not move individual files
   without also adjusting their relative paths.
3. Open `https://YOUR-SITE/games/battleship/` (or the corresponding
   `index.html` URL).
4. The game is immediately playable with the supplied **demo graphics**.
5. Replace `assets/signal.png` with your square image/QR code and replace the
   example PNGs in `assets/ships/` with your own. Keep the filenames, or edit
   `config.js` to point at new ones.

You can also test locally from this folder with either:

```bash
python3 -m http.server 8000
# Open http://localhost:8000/
```

or, if PHP is already installed:

```bash
php -S localhost:8000
# Open http://localhost:8000/
```

PHP is **supported as a web server**, but the game does not require PHP. The
removed secret-shot pattern was the only reason the old version needed PHP.
Opening `index.html` directly from disk may also work, but a local HTTP server
is recommended because browsers sometimes restrict local assets.

## 2. Folder contents

```text
battleship-standalone/
|-- index.html                 Page structure and visible instructions
|-- style.css                  Fully self-contained visual design and layout
|-- config.js                  Image paths and editable gameplay settings
|-- game.js                    Documented game rules, AI, rendering and sonar
|-- README.md                  This guide
|-- ARCHITECTURE.md            How the code works, with modification tips
|-- assets/
|   |-- signal.png             Replace with your square image or QR code
|   `-- ships/
|       |-- carrier-h.png      5-cell horizontal transparent sprite
|       |-- battleship-h.png   4-cell horizontal transparent sprite
|       |-- cruiser-h.png      3-cell horizontal transparent sprite
|       |-- submarine-h.png    3-cell horizontal transparent sprite
|       |-- destroyer-h.png    2-cell horizontal transparent sprite
|       `-- hit.png            1-cell hit/explosion sprite
```

The supplied images are **original placeholder/demo graphics**. They are not
your existing site sprites or QR code. Replace them with your own assets.

## 3. Editing graphics and settings

Open `config.js`. No other code needs to change for normal image replacement.

```js
window.BATTLESHIP_CONFIG = {
  signalImage: './assets/signal.png',
  sprites: {
    Carrier: './assets/ships/carrier-h.png',
    Battleship: './assets/ships/battleship-h.png',
    Cruiser: './assets/ships/cruiser-h.png',
    Submarine: './assets/ships/submarine-h.png',
    Destroyer: './assets/ships/destroyer-h.png'
  },
  hitSprite: './assets/ships/hit.png',
  hitRevealRadius: 0.095,
  sunkRevealRadius: 0.205,
  showSunkEnemySprites: true,
  computerTurnDelayMs: 420
};
```

- **Signal**: use a square PNG or JPEG, ideally at least 500×500 pixels. To
  use a JPEG, set `signalImage: './assets/my-code.jpg'`.
- **Ship sprites**: use transparent PNGs drawn **horizontally**. Suggested
  aspect ratios are 5:1 for Carrier, 4:1 for Battleship, 3:1 for Cruiser and
  Submarine, and 2:1 for Destroyer. The game rotates horizontal PNGs 90° for
  vertical placement. Do **not** provide separate vertical images.
- **Explosion**: `hit.png` should be a transparent, roughly square PNG. It is
  displayed at one grid cell wide and one cell high.
- **Image reveal**: `hitRevealRadius: 0.095` exposes about a cell-sized circle
  on each hit; `sunkRevealRadius: 0.205` adds a larger circle near a sunk ship.
  Both numbers are fractions of the board width.
- **Enemy sprites**: when `showSunkEnemySprites` is true (default), only
  **sunk** enemy sprites become visible beneath hit effects.
- **AI delay**: adjust `computerTurnDelayMs` to change response speed.

### Browser cache after replacing your image

Some browsers and hosting services cache unchanged filenames. Change your
configuration to `signalImage: './assets/signal.png?v=2'` (then `v=3`, etc.)
and refresh the page. If `config.js` is also heavily cached, change its tag in
`index.html` from `src="./config.js"` to `src="./config.js?v=2"`.

## 4. Gameplay

- The board is **10×10**; columns are **A–J**, rows **1–10**.
- The fleet contains Carrier (5), Battleship (4), Cruiser (3), Submarine (3),
  and Destroyer (2).
- Ships are placed horizontally or vertically and cannot overlap. Touching
  ships are allowed.
- Manual placement: click a ship name, then click its first and last grid
  cells. Clicking the same first cell again cancels that selection. Once placed,
  the next unplaced ship is automatically selected. Clicking a placed ship name
  removes it.
- **Auto-place fleet** places all five ships randomly. **Clear fleet** removes
  placements. **New game** cancels any pending turn and starts from scratch.
- During battle, the player fires on Enemy Waters. The computer takes one turn
  after each valid player attack. Double clicks cannot skip the opponent's turn.
- The computer alternates between randomly searching and pursuing live hits.
  Two aligned hits make it continue along that row/column. Once a ship is sunk,
  it stops pursuing that ship.
- Hits show explosion sprites, misses show an X, and each hit reveals a small
  circle of the hidden image. Sinking adds a larger reveal. Sinking **all**
  enemy ships reveals the image fully in a popup.

## 5. Important limitation: image privacy

The signal image is sent to the visitor's browser at the start of the game, so
JavaScript can uncover it progressively. **Its file is publicly accessible**.
Someone inspecting the site's network requests or source code can fetch it
without playing. This is appropriate for a visual/geocaching puzzle but **not
for protecting confidential information**. Adding a PHP session gate to the
reward image would require redesigning the progressive reveal (e.g. server-
generated partially masked images).

The game stores its entire state in browser memory. It does **not** save
progress, send shots to a server or verify wins server-side.

## 6. Deployment troubleshooting

- **Blank page**: check that `index.html`, `style.css`, `config.js`, and
  `game.js` are in the same folder; look for JavaScript errors in the console.
- **Ships invisible**: check PNG names and paths under `assets/ships/`; file
  names are case-sensitive on many servers.
- **Signal never appears**: check `assets/signal.png` and `signalImage` in
  `config.js`, then refresh with the query-string technique above.
- **Boards overlap text on mobile**: don't put them inside a parent with a
  fixed height. This version uses CSS grid and a square `aspect-ratio` board,
  so each panel's height grows naturally as the layout stacks.
- **Unexpected styles**: remove any external/global CSS from the embedding
  page, or serve the game in its own folder as supplied.
- **PHP**: none of the files is PHP, and the game sends no HTTP requests to
  `check.php` or `secret.php`; those old files are not part of this package.

## 7. Sharing and modifying

This package is designed as a readable starting point. The only external
software needed to **play** it is a modern browser; to **edit** it, any text
editor suffices. See `ARCHITECTURE.md` for the rendering and AI design. The
example artwork may be replaced without touching the game logic.
