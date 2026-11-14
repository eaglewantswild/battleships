/**
 * STANDALONE BATTLESHIP
 * =====================
 * Vanilla JavaScript: no libraries, build tools, PHP, cookies or external APIs.
 *
 * Module map:
 *   1. Configuration, ship definitions and mutable game state
 *   2. Fleet placement (manual and random)
 *   3. DOM rendering and sprites
 *   4. Player turns and the computer's hunt/target strategy
 *   5. Sonar mask and victory popup
 *   6. Event wiring and initialisation
 *
 * The only reward trigger is winning the normal Battleship game. There is
 * NO secret coordinate sequence, server-side shot checker or redirect.
 *
 * See README.md and config.js before modifying this file.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. CONFIGURATION AND STATE
  // ---------------------------------------------------------------------------

  var C = window.BATTLESHIP_CONFIG;
  if (!C) {
    console.error('Missing config.js: BATTLESHIP_CONFIG was not defined.');
    return;
  }

  // The standard game uses a 10x10 grid and the classic 5-ship fleet.
  // If changing the grid dimensions, also change the axes in index.html and
  // the 10% sizing logic used for sprites below.
  var SIZE = 10;
  var FLEET = [
    { name: 'Carrier', size: 5 },
    { name: 'Battleship', size: 4 },
    { name: 'Cruiser', size: 3 },
    { name: 'Submarine', size: 3 },
    { name: 'Destroyer', size: 2 }
  ];
  var CELL_PERCENT = 100 / SIZE;

  var els = {
    playerBoard: document.getElementById('playerBoard'),
    enemyBoard: document.getElementById('enemyBoard'),
    playerFleet: document.getElementById('playerFleet'),
    enemyFleet: document.getElementById('enemyFleet'),
    playerShipsLayer: document.getElementById('playerShipsLayer'),
    enemyShipsLayer: document.getElementById('enemyShipsLayer'),
    playerHitsLayer: document.getElementById('playerHitsLayer'),
    enemyHitsLayer: document.getElementById('enemyHitsLayer'),
    playerShell: document.getElementById('playerShell'),
    enemyShell: document.getElementById('enemyShell'),
    signalImage: document.getElementById('signalImage'),
    signalMask: document.getElementById('signalMask'),
    signalPopupImage: document.getElementById('signalPopupImage'),
    signalModal: document.getElementById('signalModal'),
    closeSignalBtn: document.getElementById('closeSignalBtn'),
    status: document.getElementById('status'),
    autoPlaceBtn: document.getElementById('autoPlaceBtn'),
    resetPlacementBtn: document.getElementById('resetPlacementBtn'),
    startBtn: document.getElementById('startBtn'),
    newGameBtn: document.getElementById('newGameBtn')
  };
  var ctx = els.signalMask.getContext('2d');
  if (!ctx) {
    els.status.textContent = 'This browser does not support the Canvas API.';
    return;
  }

  var state;
  var computerTimer = null;
  var modalTimer = null;

  function grid() {
    return Array.from({ length: SIZE }, function () {
      return Array(SIZE).fill(null);
    });
  }

  function freshState() {
    return {
      phase: 'placement',          // 'placement', 'battle' or 'ended'
      won: false,                 // important: defeat must NOT uncover the image
      waitingForComputer: false,  // blocks rapid multiple player shots
      selected: 0,               // index in FLEET currently being placed
      pendingStart: null,        // first click of a manual ship placement
      playerGrid: grid(),        // occupancy: { shipId, hit } or null
      enemyGrid: grid(),
      playerShips: [],           // { id, name, size, cells, hits, sunk }
      enemyShips: [],
      playerShots: grid(),       // attacks against enemy: 'hit'/'miss'/null
      enemyShots: grid(),        // attacks against player: 'hit'/'miss'/null
      enemyTargets: [],          // shuffled random hunt queue
      aiHitHistory: [],          // computer's previous successful shots
      reveals: []                // circles uncovered on the signal mask
    };
  }

  function status(message) { els.status.textContent = message; }
  function shipId(index) { return 'ship-' + index; }
  function label(x, y) { return String.fromCharCode(65 + x) + String(y + 1); }
  function inside(x, y) { return x >= 0 && y >= 0 && x < SIZE && y < SIZE; }
  function getShip(list, id) { return list.find(function (ship) { return ship.id === id; }); }
  function placed(id) { return Boolean(getShip(state.playerShips, id)); }
  function allSunk(ships) { return ships.length === FLEET.length && ships.every(function (ship) { return ship.sunk; }); }

  function shuffle(items) {
    for (var i = items.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = items[i]; items[i] = items[j]; items[j] = temp;
    }
    return items;
  }

  // ---------------------------------------------------------------------------
  // 2. FLEET PLACEMENT
  // ---------------------------------------------------------------------------

  // Returns every cell between two aligned endpoints, inclusive. Diagonal
  // placements are rejected. Reversed endpoints are supported.
  function rangeCells(x1, y1, x2, y2) {
    var cells = [];
    var i;
    if (x1 === x2) {
      for (i = Math.min(y1, y2); i <= Math.max(y1, y2); i++) cells.push([x1, i]);
      return cells;
    }
    if (y1 === y2) {
      for (i = Math.min(x1, x2); i <= Math.max(x1, x2); i++) cells.push([i, y1]);
      return cells;
    }
    return null;
  }

  function canPlace(occupancy, cells) {
    return Boolean(cells && cells.every(function (cell) {
      var x = cell[0], y = cell[1];
      return inside(x, y) && occupancy[y][x] === null;
    }));
  }

  function place(occupancy, list, definition, id, cells) {
    if (!canPlace(occupancy, cells)) return false;
    cells.forEach(function (cell) {
      occupancy[cell[1]][cell[0]] = { shipId: id, hit: false };
    });
    list.push({ id: id, name: definition.name, size: definition.size,
      cells: cells.slice(), hits: 0, sunk: false });
    return true;
  }

  // 5,000 attempts per ship is far more than normally needed for 17 squares
  // on a 100-square board. Ships may touch but cannot overlap.
  function randomFleet(occupancy, list) {
    for (var i = 0; i < FLEET.length; i++) {
      var definition = FLEET[i];
      var success = false;
      for (var attempt = 0; attempt < 5000 && !success; attempt++) {
        var horizontal = Math.random() < 0.5;
        var x = Math.floor(Math.random() * SIZE);
        var y = Math.floor(Math.random() * SIZE);
        var cells = [];
        for (var n = 0; n < definition.size; n++) {
          cells.push([x + (horizontal ? n : 0), y + (horizontal ? 0 : n)]);
        }
        success = place(occupancy, list, definition, shipId(i), cells);
      }
      if (!success) return false;
    }
    return true;
  }

  function nextUnplaced() {
    for (var i = 0; i < FLEET.length; i++) if (!placed(shipId(i))) return i;
    return -1;
  }

  function autoPlaceFleet() {
    if (state.phase !== 'placement') return;
    state.playerGrid = grid();
    state.playerShips = [];
    state.pendingStart = null;
    state.selected = 0;
    status(randomFleet(state.playerGrid, state.playerShips)
      ? 'All five ships deployed. Press Start battle when ready.'
      : 'Could not place the fleet. Please try again.');
    render();
  }

  function clearFleet() {
    if (state.phase !== 'placement') return;
    state.playerGrid = grid();
    state.playerShips = [];
    state.pendingStart = null;
    state.selected = 0;
    status('Fleet cleared. Click the first and last square of the selected ship.');
    render();
  }

  function removeShip(id) {
    var ship = getShip(state.playerShips, id);
    if (!ship) return;
    ship.cells.forEach(function (c) { state.playerGrid[c[1]][c[0]] = null; });
    state.playerShips = state.playerShips.filter(function (s) { return s.id !== id; });
    state.selected = Number(id.substring(5));
    state.pendingStart = null;
    status(ship.name + ' removed. Place it again.');
    render();
  }

  function placementClick(x, y) {
    if (state.phase !== 'placement') return;
    var index = state.selected;
    var definition = FLEET[index];
    var id = shipId(index);
    if (placed(id)) return;

    if (!state.pendingStart) {
      state.pendingStart = { x: x, y: y };
      status(definition.name + ': first square ' + label(x, y) + ' selected. Click its last square.');
      render();
      return;
    }
    if (state.pendingStart.x === x && state.pendingStart.y === y) {
      state.pendingStart = null;
      status('First square deselected. Choose a new starting square.');
      render();
      return;
    }

    var cells = rangeCells(state.pendingStart.x, state.pendingStart.y, x, y);
    if (!cells || cells.length !== definition.size || !canPlace(state.playerGrid, cells)) {
      status('Invalid placement. ' + definition.name + ' needs ' + definition.size + ' unobstructed squares in one row or column.');
      return;
    }
    place(state.playerGrid, state.playerShips, definition, id, cells);
    state.pendingStart = null;
    var next = nextUnplaced();
    if (next === -1) status('Fleet ready. Press Start battle.');
    else {
      state.selected = next;
      status(definition.name + ' placed. Now place your ' + FLEET[next].name + '.');
    }
    render();
  }

  function clearPreview() {
    els.playerBoard.querySelectorAll('.preview-ok,.preview-bad').forEach(function (cell) {
      cell.classList.remove('preview-ok', 'preview-bad');
    });
  }

  function placementHover(x, y) {
    clearPreview();
    if (state.phase !== 'placement') return;
    var definition = FLEET[state.selected];
    if (placed(shipId(state.selected))) return;
    var cells = state.pendingStart
      ? rangeCells(state.pendingStart.x, state.pendingStart.y, x, y)
      : Array.from({ length: definition.size }, function (_, i) { return [x + i, y]; });
    if (!cells) return;
    var valid = cells.length === definition.size && canPlace(state.playerGrid, cells);
    cells.forEach(function (c) {
      if (!inside(c[0], c[1])) return;
      var target = els.playerBoard.querySelector('[data-x="' + c[0] + '"][data-y="' + c[1] + '"]');
      if (target) target.classList.add(valid ? 'preview-ok' : 'preview-bad');
    });
  }

  // ---------------------------------------------------------------------------
  // 3. DOM RENDERING AND SPRITES
  // ---------------------------------------------------------------------------

  // Build the 100 actual button elements only once. Updating existing nodes
  // preserves keyboard focus after each shot and avoids duplicated listeners.
  function makeBoardButtons(container) {
    for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'cell';
      button.dataset.x = String(x);
      button.dataset.y = String(y);
      button.setAttribute('aria-label', label(x, y));
      container.appendChild(button);
    }
  }

  function renderBoard(container, owner) {
    var buttons = container.children;
    for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) {
      var button = buttons[y * SIZE + x];
      var isPlayer = owner === 'player';
      var shot = (isPlayer ? state.enemyShots : state.playerShots)[y][x];
      var ship = (isPlayer ? state.playerGrid : state.enemyGrid)[y][x];
      var actionable = isPlayer ? state.phase === 'placement'
        : state.phase === 'battle' && !state.waitingForComputer && !shot;
      var className = 'cell';
      if (isPlayer && ship) className += ' is-ship';
      if (isPlayer && state.pendingStart && state.pendingStart.x === x &&
          state.pendingStart.y === y) className += ' pending-start';
      if (shot === 'hit') className += ' is-hit';
      if (shot === 'miss') className += ' is-miss';
      if (actionable) className += ' is-actionable';
      button.className = className;
      button.disabled = !actionable;
      var suffix = shot ? (', ' + shot) : (isPlayer && ship ? ', occupied' : '');
      button.setAttribute('aria-label', (isPlayer ? 'Your fleet ' : 'Enemy waters ') + label(x, y) + suffix);
    }
  }

  function textSpan(text, cssClass) {
    var span = document.createElement('span');
    span.textContent = text;
    if (cssClass) span.className = cssClass;
    return span;
  }

  function renderFleet() {
    els.playerFleet.replaceChildren();
    FLEET.forEach(function (definition, index) {
      var id = shipId(index);
      var isPlaced = placed(id);
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'fleet-row' + (isPlaced ? ' placed' : '') +
        (state.phase === 'placement' && state.selected === index ? ' active' : '');
      row.disabled = state.phase !== 'placement';
      row.setAttribute('aria-label', definition.name + ', ' + definition.size + ' cells, ' +
        (isPlaced ? 'placed; select to remove' : 'select to place'));
      row.append(textSpan(definition.name, 'fleet-name'), textSpan(isPlaced ? 'Placed' : definition.size + ' cells'));
      row.addEventListener('click', function () {
        if (isPlaced) removeShip(id);
        else {
          state.selected = index;
          state.pendingStart = null;
          status('Place your ' + definition.name + ': click its first and last squares.');
          render();
        }
      });
      els.playerFleet.appendChild(row);
    });

    els.enemyFleet.replaceChildren();
    FLEET.forEach(function (definition, index) {
      var ship = getShip(state.enemyShips, shipId(index));
      var row = document.createElement('div');
      row.className = 'fleet-row' + (ship && ship.sunk ? ' sunk' : '');
      row.append(textSpan(definition.name, 'fleet-name'),
        textSpan(ship && ship.sunk ? 'Sunk' : 'Afloat'));
      els.enemyFleet.appendChild(row);
    });
  }

  function orientation(ship) {
    return ship.cells[0][1] === ship.cells[1][1] ? 'horizontal' : 'vertical';
  }

  // One horizontal PNG per ship is enough. Rotate by 90 degrees for vertical
  // placement; percentages keep sprites aligned as the board resizes.
  function renderShips(layer, ships, sunkOnly) {
    layer.replaceChildren();
    ships.forEach(function (ship) {
      if (sunkOnly && !ship.sunk) return;
      var src = C.sprites && C.sprites[ship.name];
      if (!src) return;
      var xs = ship.cells.map(function (c) { return c[0]; });
      var ys = ship.cells.map(function (c) { return c[1]; });
      var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
      var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
      var horizontal = orientation(ship) === 'horizontal';
      var image = document.createElement('img');
      image.className = 'ship-sprite';
      image.src = src;
      image.alt = '';
      image.draggable = false;
      image.style.left = ((minX + maxX + 1) / 2 * CELL_PERCENT) + '%';
      image.style.top = ((minY + maxY + 1) / 2 * CELL_PERCENT) + '%';
      image.style.width = ship.size * CELL_PERCENT + '%';
      image.style.height = CELL_PERCENT + '%';
      image.style.transform = 'translate(-50%, -50%)' + (horizontal ? '' : ' rotate(90deg)');
      image.onerror = function () { image.hidden = true; };
      layer.appendChild(image);
    });
  }

  function renderHits(layer, shots) {
    layer.replaceChildren();
    if (state.phase === 'placement') return;
    for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) {
      if (shots[y][x] !== 'hit') continue;
      var image = document.createElement('img');
      image.className = 'hit-sprite';
      image.src = C.hitSprite;
      image.alt = '';
      image.style.left = x * CELL_PERCENT + '%';
      image.style.top = y * CELL_PERCENT + '%';
      image.onerror = function () { this.hidden = true; };
      layer.appendChild(image);
    }
  }

  function render() {
    renderBoard(els.playerBoard, 'player');
    renderBoard(els.enemyBoard, 'enemy');
    renderFleet();
    renderShips(els.playerShipsLayer, state.playerShips, false);
    if (C.showSunkEnemySprites !== false) renderShips(els.enemyShipsLayer, state.enemyShips, true);
    else els.enemyShipsLayer.replaceChildren();
    renderHits(els.playerHitsLayer, state.enemyShots);
    renderHits(els.enemyHitsLayer, state.playerShots);
    els.startBtn.disabled = state.phase !== 'placement' || state.playerShips.length !== FLEET.length;
    els.autoPlaceBtn.disabled = state.phase !== 'placement';
    els.resetPlacementBtn.disabled = state.phase !== 'placement';
  }

  // ---------------------------------------------------------------------------
  // 4. TURNS AND COMPUTER OPPONENT
  // ---------------------------------------------------------------------------

  function startBattle() {
    if (state.phase !== 'placement' || state.playerShips.length !== FLEET.length) return;
    state.enemyGrid = grid();
    state.enemyShips = [];
    if (!randomFleet(state.enemyGrid, state.enemyShips)) {
      status('Unable to place the enemy fleet. Please try a new game.');
      return;
    }
    state.playerShots = grid();
    state.enemyShots = grid();
    state.enemyTargets = [];
    state.aiHitHistory = [];
    state.reveals = [];
    state.won = false;
    state.waitingForComputer = false;
    for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) {
      state.enemyTargets.push([x, y]);
    }
    shuffle(state.enemyTargets);
    state.phase = 'battle';
    status('Battle started. Choose a square in Enemy Waters to fire.');
    redrawMask();
    render();
  }

  function playerAttack(x, y) {
    if (state.phase !== 'battle' || state.waitingForComputer || state.playerShots[y][x]) return;
    var square = state.enemyGrid[y][x];
    var description;
    ping(x, y);

    if (square) {
      square.hit = true;
      state.playerShots[y][x] = 'hit';
      var ship = getShip(state.enemyShips, square.shipId);
      ship.hits++;
      addReveal(x, y, Number(C.hitRevealRadius));
      if (ship.hits >= ship.size) {
        ship.sunk = true;
        var sumX = 0, sumY = 0;
        ship.cells.forEach(function (c) { sumX += c[0]; sumY += c[1]; });
        addReveal(sumX / ship.size, sumY / ship.size, Number(C.sunkRevealRadius));
        description = 'Direct hit at ' + label(x, y) + '. You sunk the ' + ship.name + '!';
      } else description = 'Direct hit at ' + label(x, y) + '!';
    } else {
      state.playerShots[y][x] = 'miss';
      description = label(x, y) + ': miss.';
    }

    // Standard win condition only: every enemy ship must be destroyed.
    // No coordinate combination is recorded, checked or sent to a server.
    if (allSunk(state.enemyShips)) {
      state.phase = 'ended';
      state.won = true;
      revealAll();
      status('Victory! Enemy fleet destroyed. Signal recovered.');
      render();
      modalTimer = window.setTimeout(openModal, 350);
      return;
    }

    state.waitingForComputer = true;
    status(description + ' Enemy responding...');
    render();
    computerTimer = window.setTimeout(computerTurn, Math.max(0, Number(C.computerTurnDelayMs) || 420));
  }

  function addCandidate(candidates, x, y) {
    if (!inside(x, y) || state.enemyShots[y][x]) return;
    if (!candidates.some(function (c) { return c[0] === x && c[1] === y; })) candidates.push([x, y]);
  }

  // HUNT / TARGET AI:
  //   - Hunt: choose a random as-yet-unfired square.
  //   - Target: after a hit, inspect its four neighbours.
  //   - Orientation: with two aligned hits, continue along their row/column.
  //   - On sinking: ignore hits belonging to that already-destroyed ship.
  function chooseAiTarget() {
    var active = state.aiHitHistory.filter(function (c) {
      var square = state.playerGrid[c[1]][c[0]];
      var ship = square && getShip(state.playerShips, square.shipId);
      return ship && !ship.sunk;
    }).reverse();

    // Pursue pairs from the same damaged ship. The opponent never fires into
    // already-attacked squares; ship identity is used only to group past hits.
    for (var i = 0; i < active.length; i++) {
      var a = active[i];
      var aId = state.playerGrid[a[1]][a[0]].shipId;
      for (var j = i + 1; j < active.length; j++) {
        var b = active[j];
        if (state.playerGrid[b[1]][b[0]].shipId !== aId) continue;
        var candidates = [];
        if (a[1] === b[1]) {
          addCandidate(candidates, Math.min(a[0], b[0]) - 1, a[1]);
          addCandidate(candidates, Math.max(a[0], b[0]) + 1, a[1]);
        } else if (a[0] === b[0]) {
          addCandidate(candidates, a[0], Math.min(a[1], b[1]) - 1);
          addCandidate(candidates, a[0], Math.max(a[1], b[1]) + 1);
        }
        if (candidates.length) return shuffle(candidates)[0];
      }
    }

    for (var h = 0; h < active.length; h++) {
      var hit = active[h];
      var neighbours = [];
      addCandidate(neighbours, hit[0] - 1, hit[1]);
      addCandidate(neighbours, hit[0] + 1, hit[1]);
      addCandidate(neighbours, hit[0], hit[1] - 1);
      addCandidate(neighbours, hit[0], hit[1] + 1);
      if (neighbours.length) return shuffle(neighbours)[0];
    }

    while (state.enemyTargets.length) {
      var candidate = state.enemyTargets.pop();
      if (!state.enemyShots[candidate[1]][candidate[0]]) return candidate;
    }
    return null;
  }

  function computerTurn() {
    computerTimer = null;
    if (state.phase !== 'battle') return;
    var target = chooseAiTarget();
    if (!target) { state.waitingForComputer = false; return; }
    var x = target[0], y = target[1];
    var square = state.playerGrid[y][x];
    var description;
    if (square) {
      square.hit = true;
      state.enemyShots[y][x] = 'hit';
      state.aiHitHistory.push([x, y]);
      var ship = getShip(state.playerShips, square.shipId);
      ship.hits++;
      if (ship.hits >= ship.size) {
        ship.sunk = true;
        description = 'Enemy hit ' + label(x, y) + ' and sank your ' + ship.name + '.';
      } else description = 'Enemy hit your ship at ' + label(x, y) + '.';
    } else {
      state.enemyShots[y][x] = 'miss';
      description = 'Enemy missed at ' + label(x, y) + '. Your turn.';
    }

    if (allSunk(state.playerShips)) {
      state.phase = 'ended';
      status('Your fleet has been destroyed. Press New game to try again.');
    } else status(description);
    state.waitingForComputer = false;
    render();
  }

  // ---------------------------------------------------------------------------
  // 5. SONAR IMAGE REVEAL AND MODAL
  // ---------------------------------------------------------------------------

  // Canvas pixels follow the displayed board size, not a hardcoded 296px.
  // This is why the mask stays correctly aligned after a responsive resize.
  function sizeCanvas() {
    var bounds = els.enemyShell.getBoundingClientRect();
    var width = Math.max(1, Math.round(bounds.width));
    var height = Math.max(1, Math.round(bounds.height));
    if (els.signalMask.width !== width) els.signalMask.width = width;
    if (els.signalMask.height !== height) els.signalMask.height = height;
  }

  function redrawMask() {
    sizeCanvas();
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, els.signalMask.width, els.signalMask.height);
    if (state.won) return;
    ctx.fillStyle = '#ece0c8';
    ctx.fillRect(0, 0, els.signalMask.width, els.signalMask.height);
    state.reveals.forEach(function (reveal) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(reveal.x * els.signalMask.width, reveal.y * els.signalMask.height,
        reveal.r * els.signalMask.width, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function addReveal(x, y, radius) {
    if (!(radius > 0)) return;
    state.reveals.push({ x: (x + .5) / SIZE, y: (y + .5) / SIZE, r: radius });
    redrawMask();
  }

  function revealAll() { redrawMask(); }

  function ping(x, y) {
    var marker = document.createElement('div');
    marker.className = 'sonar-ping';
    marker.style.left = ((x + .5) * CELL_PERCENT) + '%';
    marker.style.top = ((y + .5) * CELL_PERCENT) + '%';
    els.enemyShell.appendChild(marker);
    window.setTimeout(function () { marker.remove(); }, 750);
  }

  function openModal() {
    modalTimer = null;
    if (!state.won) return;
    els.signalModal.hidden = false;
    els.closeSignalBtn.focus();
  }

  function closeModal() { els.signalModal.hidden = true; }

  // ---------------------------------------------------------------------------
  // 6. EVENTS AND INITIALISATION
  // ---------------------------------------------------------------------------

  function stopTimers() {
    if (computerTimer !== null) window.clearTimeout(computerTimer);
    if (modalTimer !== null) window.clearTimeout(modalTimer);
    computerTimer = null;
    modalTimer = null;
  }

  function newGame() {
    stopTimers();
    closeModal();
    els.enemyShell.querySelectorAll('.sonar-ping').forEach(function (n) { n.remove(); });
    state = freshState();
    status('Place your fleet. Select a ship, then click its first and last squares.');
    render();
    redrawMask();
  }

  function cellFromEvent(event, container) {
    var button = event.target.closest('.cell');
    if (!button || !container.contains(button)) return null;
    return { x: Number(button.dataset.x), y: Number(button.dataset.y) };
  }

  els.playerBoard.addEventListener('click', function (event) {
    var c = cellFromEvent(event, els.playerBoard);
    if (c) placementClick(c.x, c.y);
  });
  els.playerBoard.addEventListener('pointerover', function (event) {
    var c = cellFromEvent(event, els.playerBoard);
    if (c) placementHover(c.x, c.y);
  });
  els.playerBoard.addEventListener('pointerleave', clearPreview);

  els.enemyBoard.addEventListener('click', function (event) {
    var c = cellFromEvent(event, els.enemyBoard);
    if (c) playerAttack(c.x, c.y);
  });

  els.autoPlaceBtn.addEventListener('click', autoPlaceFleet);
  els.resetPlacementBtn.addEventListener('click', clearFleet);
  els.startBtn.addEventListener('click', startBattle);
  els.newGameBtn.addEventListener('click', newGame);
  els.closeSignalBtn.addEventListener('click', closeModal);
  els.signalModal.addEventListener('click', function (event) {
    if (event.target === els.signalModal) closeModal();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !els.signalModal.hidden) closeModal();
  });

  if (window.ResizeObserver) {
    new ResizeObserver(redrawMask).observe(els.enemyShell);
  } else {
    window.addEventListener('resize', redrawMask);
  }

  // Local paths make this folder portable: e.g. /games/battleship/index.html.
  els.signalImage.src = C.signalImage;
  els.signalPopupImage.src = C.signalImage;
  els.signalImage.onerror = function () {
    console.warn('Signal image not found. Check config.js:', C.signalImage);
  };

  makeBoardButtons(els.playerBoard);
  makeBoardButtons(els.enemyBoard);
  newGame();
})();
