# Developer notes: how standalone Battleship works

## Overview

`index.html` contains the semantic structure (two boards, two fleet lists,
buttons, status line and end-game popup). `style.css` is entirely standalone.
`config.js` is the deployment-specific configuration. `game.js` holds the
application, wrapped in an immediately invoked function to avoid global
variable collisions.

Scripts are included at the end of `index.html` in this order:

```html
<script src="./config.js"></script>
<script src="./game.js"></script>
```

`game.js` reads `window.BATTLESHIP_CONFIG`, then initialises the board. No
JavaScript bundler, package manager or web API is required.

## Data model

The 10x10 board uses `[row][column]` indexing, i.e. `grid[y][x]`.

- `playerGrid`, `enemyGrid`: either `null` or `{ shipId, hit }` per cell.
- `playerShots`, `enemyShots`: `null`, `"hit"`, or `"miss"` per cell.
- `playerShips`, `enemyShips`: ship objects with `id`, `name`, `size`, `cells`,
  `hits` and `sunk`.
- `phase`: `"placement"`, `"battle"`, or `"ended"`.
- `selected`, `pendingStart`: two-click placement state.
- `waitingForComputer`: a turn lock; prevents multiple attacks before AI fires.
- `enemyTargets`: shuffled random hunt targets.
- `aiHitHistory`: computer strikes that succeeded.
- `reveals`: circles in normalized board coordinates, used to redraw the mask.
- `won`: true only on player victory. A loss must not accidentally reveal the
  full image when the browser window resizes.

`newGame()` clears outstanding timers, resets all state, and redraws the UI.

## How the boards are rendered

`makeBoardButtons()` creates exactly 100 button elements per board once. Each
button is labelled (A1-J10), has `data-x`/`data-y` and is keyboard accessible.
`renderBoard()` updates existing buttons rather than replacing them, which
preserves the focus after a shot. The event handlers are attached to the board
containers (event delegation), not to each individual cell.

The two board components have these layers (back to front):

1. Enemy only: the hidden square `signal-image`.
2. Enemy only: `signal-mask` (HTML canvas, initially opaque).
3. `ship-layer`: visible player ships and *sunk* enemy ships.
4. `.board`: the 10x10 clickable buttons, with dashed borders and miss Xs.
5. `hit-layer`: explosions, placed **above** buttons so they remain visible.
6. Sonar ping effect, momentarily displayed when the player fires.

The **same** horizontal ship sprite is used in both orientations. Sprite
length is a percentage of board width (`ship.size * 10%`); vertical sprites
have `rotate(90deg)`. This aligns them even when the board shrinks on mobile.

## Image reveal

`redrawMask()` paints a solid rectangle onto the canvas and removes circles
using the `destination-out` blend mode. Each successful shot calls
`addReveal(x,y,hitRevealRadius)`. Sinking a ship adds a larger circle at its
centre. Reveal coordinates are normalized (0.0-1.0), so resizing the board
and canvas preserves all previous reveal locations.

On victory `state.won` is set, so `redrawMask()` only clears the canvas and
never paints the cover again. The modal displays the complete image. On a
loss `state.won` remains false.

## AI: hunt and target

`chooseAiTarget()` uses a hunt/target policy:

- If there are two hits belonging to the same still-afloat ship on a common
  row/column, try cells extending that line.
- Otherwise, try neighbouring untried cells around an active hit.
- Otherwise, pop the next unused cell from a shuffled list of 100 positions.

The AI uses ship identity internally to avoid combining hits from unrelated
ships, but **does not fire at unhit cells based on hidden ship positions**.
Only known successful hits can form a target chain. Ship placement itself is
random and not derived from the player's clicks.

## Where to change things

| Goal | File/location |
| --- | --- |
| Replace QR/reward image | `assets/signal.png` and `config.js` |
| Replace ship/explosion sprites | `assets/ships/` and `config.js` |
| Change colours/layout | `style.css` CSS custom properties in `:root` |
| Change instructions/headings | `index.html` |
| Adjust sonar sizes or AI speed | `config.js` |
| Change fleet sizes/names | `FLEET` in `game.js` (also review sprite widths) |
| Change 10x10 grid | `SIZE` in `game.js`, axes in HTML and percentages in CSS/JS |
| Add persistent storage | `newGame()`, state initialisation and update logic in `game.js` |

## Removed intentionally

The old site version used absolute paths such as `/config/battleship`, inherited
ThemeKings CSS/JavaScript, and called PHP files to check an arbitrary set of
shot coordinates. **None of those are present.** This package never compares
shots to a secret pattern or makes a shot-validation POST request.

## Suggested manual test checklist

1. Open `index.html` via an HTTP server. Both grids display properly.
2. Select a ship and place it in horizontal and vertical orientations; check
   that sprites rotate correctly.
3. Click a placed ship in the fleet list to remove it. Place it again.
4. Auto-place, start, and fire repeatedly. One computer move should follow
   each valid shot. A second fast click must not produce a second player shot.
5. Hit an enemy ship: a small region of the image appears. Sink it: a larger
   region appears and its ship sprite becomes visible.
6. Win: the full image and victory popup appear. Close the popup, resize,
   and confirm the image stays visible.
7. Lose: the game ends without showing the full image.
8. Restart during a pending computer turn: no delayed shot should occur in the
   new game.
9. Reduce viewport width to ~375px: boards stack without obscuring text.
10. Replace the image, then update its query-string version to check caching.
