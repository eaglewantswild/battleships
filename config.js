/**
 * Standalone Battleship - edit this file to customise the game.
 *
 * Paths are relative to index.html. No absolute URLs, PHP routes, or external
 * stylesheets are needed. Append ?v=2 to an image path after replacing a cached
 * file on a live server (example: "./assets/signal.png?v=2").
 *
 * All sprite images should be horizontal and have transparent backgrounds.
 * The game rotates them automatically for vertical ships.
 */
window.BATTLESHIP_CONFIG = {
  // A square image to uncover gradually with successful attacks.
  signalImage: "./assets/signal.png",

  // Horizontal PNG sprites. Match each sprite's aspect ratio to its ship length.
  sprites: {
    Carrier: "./assets/ships/carrier-h.png",        // 5 cells wide
    Battleship: "./assets/ships/battleship-h.png",  // 4 cells wide
    Cruiser: "./assets/ships/cruiser-h.png",        // 3 cells wide
    Submarine: "./assets/ships/submarine-h.png",    // 3 cells wide
    Destroyer: "./assets/ships/destroyer-h.png"     // 2 cells wide
  },
  hitSprite: "./assets/ships/hit.png",             // 1-cell explosion PNG

  // Radii are fractions of the board width (0.10 = one grid cell's width).
  hitRevealRadius: 0.095,
  sunkRevealRadius: 0.205,

  // Visual and gameplay settings.
  showSunkEnemySprites: true,
  computerTurnDelayMs: 420
};
