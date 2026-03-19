// ===== Five-in-a-Row (Gomoku) =====
// Human (Black) vs AI (White)

(function() {
  'use strict';

  // ===== Constants =====
  const BOARD_SIZE = 15;
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const DIRECTIONS = [[1,0],[0,1],[1,1],[1,-1]]; // horizontal, vertical, diagonal

  // ===== State =====
  let board = [];
  let history = [];
  let currentPlayer = BLACK;
  let gameOver = false;
  let difficulty = 'medium'; // easy, medium, hard
  let soundEnabled = true;
  let audioCtx = null;
  let canvasSize = 0;
  let cellSize = 0;
  let padding = 0;
  let animatingStone = null; // {row, col, progress, color}
  let lastMove = null;
  let winLine = null; // [{row, col}, ...]

  // ===== DOM =====
  const canvas = document.getElementById('board-canvas');
  const ctx = canvas.getContext('2d');
  const titleScreen = document.getElementById('title-screen');
  const gameScreen = document.getElementById('game-screen');
  const resultOverlay = document.getElementById('result-overlay');
  const turnText = document.getElementById('turn-text');
  const resultTitle = document.getElementById('result-title');
  const resultDesc = document.getElementById('result-desc');

  // ===== Audio =====
  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playStoneSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const now = audioCtx.currentTime;
      // Wooden click sound
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } catch(e) {}
  }

  function playWinSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const now = audioCtx.currentTime + i * 0.12;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      });
    } catch(e) {}
  }

  function playLoseSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
      const notes = [400, 350, 300, 250];
      notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const now = audioCtx.currentTime + i * 0.15;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      });
    } catch(e) {}
  }

  // ===== Board Logic =====
  function createBoard() {
    board = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      board[r] = new Array(BOARD_SIZE).fill(EMPTY);
    }
    history = [];
    currentPlayer = BLACK;
    gameOver = false;
    lastMove = null;
    winLine = null;
    animatingStone = null;
  }

  function inBounds(r, c) {
    return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
  }

  function placeStone(row, col, color) {
    board[row][col] = color;
    history.push({row, col, color});
    lastMove = {row, col};
  }

  function undoMove() {
    if (history.length < 2 || gameOver) return;
    // Remove AI move + player move
    const aiMove = history.pop();
    board[aiMove.row][aiMove.col] = EMPTY;
    const playerMove = history.pop();
    board[playerMove.row][playerMove.col] = EMPTY;
    currentPlayer = BLACK;
    lastMove = history.length > 0 ? history[history.length - 1] : null;
    winLine = null;
    updateTurnText();
    drawBoard();
  }

  // ===== Win Detection =====
  function checkWin(row, col, color) {
    for (const [dr, dc] of DIRECTIONS) {
      let count = 1;
      const line = [{row, col}];
      // Forward
      for (let i = 1; i < 5; i++) {
        const nr = row + dr * i, nc = col + dc * i;
        if (inBounds(nr, nc) && board[nr][nc] === color) {
          count++;
          line.push({row: nr, col: nc});
        } else break;
      }
      // Backward
      for (let i = 1; i < 5; i++) {
        const nr = row - dr * i, nc = col - dc * i;
        if (inBounds(nr, nc) && board[nr][nc] === color) {
          count++;
          line.push({row: nr, col: nc});
        } else break;
      }
      if (count >= 5) {
        winLine = line;
        return true;
      }
    }
    return false;
  }

  function isBoardFull() {
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++)
        if (board[r][c] === EMPTY) return false;
    return true;
  }

  // ===== AI =====
  // Score patterns for AI evaluation
  const SCORES = {
    FIVE: 10000000,
    OPEN_FOUR: 500000,
    FOUR: 100000,
    OPEN_THREE: 50000,
    THREE: 10000,
    OPEN_TWO: 5000,
    TWO: 1000,
    ONE: 100
  };

  function evaluateLine(board, row, col, dr, dc, color) {
    const opp = color === BLACK ? WHITE : BLACK;
    let count = 0;
    let openEnds = 0;
    let blocked = false;

    // Count consecutive stones in forward direction
    let r = row + dr, c = col + dc;
    while (inBounds(r, c) && board[r][c] === color) {
      count++;
      r += dr; c += dc;
    }
    if (inBounds(r, c) && board[r][c] === EMPTY) openEnds++;
    else blocked = true;

    // Count consecutive stones in backward direction
    r = row - dr; c = col - dc;
    while (inBounds(r, c) && board[r][c] === color) {
      count++;
      r -= dr; c -= dc;
    }
    if (inBounds(r, c) && board[r][c] === EMPTY) openEnds++;

    // Total count includes the stone at (row, col)
    count += 1;

    if (count >= 5) return SCORES.FIVE;
    if (count === 4) {
      if (openEnds === 2) return SCORES.OPEN_FOUR;
      if (openEnds === 1) return SCORES.FOUR;
    }
    if (count === 3) {
      if (openEnds === 2) return SCORES.OPEN_THREE;
      if (openEnds === 1) return SCORES.THREE;
    }
    if (count === 2) {
      if (openEnds === 2) return SCORES.OPEN_TWO;
      if (openEnds === 1) return SCORES.TWO;
    }
    if (count === 1 && openEnds > 0) return SCORES.ONE;
    return 0;
  }

  function evaluatePosition(board, row, col, color) {
    let score = 0;
    for (const [dr, dc] of DIRECTIONS) {
      score += evaluateLine(board, row, col, dr, dc, color);
    }
    return score;
  }

  function getCandidateMoves(board) {
    const candidates = new Set();
    const range = 2;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] !== EMPTY) {
          for (let dr = -range; dr <= range; dr++) {
            for (let dc = -range; dc <= range; dc++) {
              const nr = r + dr, nc = c + dc;
              if (inBounds(nr, nc) && board[nr][nc] === EMPTY) {
                candidates.add(nr * BOARD_SIZE + nc);
              }
            }
          }
        }
      }
    }
    if (candidates.size === 0) {
      // First move: play near center
      candidates.add(7 * BOARD_SIZE + 7);
    }
    return [...candidates].map(v => ({row: Math.floor(v / BOARD_SIZE), col: v % BOARD_SIZE}));
  }

  function scoreMove(board, row, col, aiColor) {
    const humanColor = aiColor === BLACK ? WHITE : BLACK;
    // Attack score (how good for AI)
    board[row][col] = aiColor;
    const attack = evaluatePosition(board, row, col, aiColor);
    board[row][col] = EMPTY;
    // Defense score (how good would it be for human)
    board[row][col] = humanColor;
    const defense = evaluatePosition(board, row, col, humanColor);
    board[row][col] = EMPTY;
    return { attack, defense, total: attack * 1.1 + defense };
  }

  function aiMove() {
    const aiColor = WHITE;
    const candidates = getCandidateMoves(board);

    if (candidates.length === 0) return null;

    // First move by AI: play adjacent to center
    if (history.length === 1) {
      const center = {row: 7, col: 7};
      if (board[7][7] === EMPTY) return center;
      const offsets = [[0,1],[1,0],[1,1],[-1,1]];
      const [dr, dc] = offsets[Math.floor(Math.random() * offsets.length)];
      return {row: history[0].row + dr, col: history[0].col + dc};
    }

    // Score all candidates
    let scored = candidates.map(m => {
      const s = scoreMove(board, m.row, m.col, aiColor);
      return {...m, ...s};
    });

    // Sort by total score
    scored.sort((a, b) => b.total - a.total);

    // Difficulty-based selection
    if (difficulty === 'easy') {
      // Pick from top 40% candidates with some randomness
      const topN = Math.max(3, Math.floor(scored.length * 0.4));
      const pick = Math.floor(Math.random() * topN);
      return scored[pick];
    }

    if (difficulty === 'medium') {
      // Minimax-like: just take the best scored move, but sometimes (10%) pick 2nd best
      if (scored.length > 1 && Math.random() < 0.1) return scored[1];
      return scored[0];
    }

    // Hard: deeper evaluation with minimax for top candidates
    const topMoves = scored.slice(0, Math.min(8, scored.length));

    let bestScore = -Infinity;
    let bestMove = topMoves[0];

    for (const move of topMoves) {
      board[move.row][move.col] = aiColor;

      // Check instant win
      if (checkWinNoStore(move.row, move.col, aiColor)) {
        board[move.row][move.col] = EMPTY;
        return move;
      }

      // Simulate human response (1-ply)
      let worstCase = Infinity;
      const responses = getCandidateMoves(board).slice(0, 6);
      for (const resp of responses) {
        const s = scoreMove(board, resp.row, resp.col, BLACK);
        worstCase = Math.min(worstCase, move.total - s.total * 0.5);
      }

      board[move.row][move.col] = EMPTY;

      if (worstCase > bestScore) {
        bestScore = worstCase;
        bestMove = move;
      }
    }

    return bestMove;
  }

  function checkWinNoStore(row, col, color) {
    for (const [dr, dc] of DIRECTIONS) {
      let count = 1;
      for (let i = 1; i < 5; i++) {
        const nr = row + dr * i, nc = col + dc * i;
        if (inBounds(nr, nc) && board[nr][nc] === color) count++;
        else break;
      }
      for (let i = 1; i < 5; i++) {
        const nr = row - dr * i, nc = col - dc * i;
        if (inBounds(nr, nc) && board[nr][nc] === color) count++;
        else break;
      }
      if (count >= 5) return true;
    }
    return false;
  }

  // ===== Canvas Drawing =====
  function resizeCanvas() {
    const wrapper = document.querySelector('.canvas-wrapper');
    const maxW = wrapper.clientWidth - 8;
    const maxH = wrapper.clientHeight - 8;
    canvasSize = Math.min(maxW, maxH, 560);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = canvasSize * dpr;
    canvas.height = canvasSize * dpr;
    canvas.style.width = canvasSize + 'px';
    canvas.style.height = canvasSize + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    padding = canvasSize * 0.04;
    cellSize = (canvasSize - padding * 2) / (BOARD_SIZE - 1);
  }

  function boardToPixel(row, col) {
    return {
      x: padding + col * cellSize,
      y: padding + row * cellSize
    };
  }

  function pixelToBoard(px, py) {
    const col = Math.round((px - padding) / cellSize);
    const row = Math.round((py - padding) / cellSize);
    if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
      return {row, col};
    }
    return null;
  }

  function drawBoard() {
    // Background
    ctx.fillStyle = '#d4a55a';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Wood grain effect (subtle)
    ctx.save();
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 40; i++) {
      const y = (i / 40) * canvasSize;
      ctx.strokeStyle = i % 3 === 0 ? '#8b6914' : '#c49a3c';
      ctx.lineWidth = 0.5 + Math.random() * 1;
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(i) * 3);
      for (let x = 0; x < canvasSize; x += 20) {
        ctx.lineTo(x, y + Math.sin(i + x * 0.01) * 3);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Grid lines
    ctx.strokeStyle = '#4a3520';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < BOARD_SIZE; i++) {
      const p1 = boardToPixel(i, 0);
      const p2 = boardToPixel(i, BOARD_SIZE - 1);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      const p3 = boardToPixel(0, i);
      const p4 = boardToPixel(BOARD_SIZE - 1, i);
      ctx.beginPath();
      ctx.moveTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.stroke();
    }

    // Star points (天元 and corner stars)
    const starPoints = [[3,3],[3,11],[7,7],[11,3],[11,11],[3,7],[7,3],[7,11],[11,7]];
    ctx.fillStyle = '#4a3520';
    for (const [r, c] of starPoints) {
      const p = boardToPixel(r, c);
      ctx.beginPath();
      ctx.arc(p.x, p.y, cellSize * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw stones
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] !== EMPTY) {
          drawStone(r, c, board[r][c]);
        }
      }
    }

    // Win line highlight
    if (winLine) {
      ctx.save();
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.7;
      ctx.shadowColor = '#ff4444';
      ctx.shadowBlur = 8;
      // Sort line by position
      winLine.sort((a, b) => a.row === b.row ? a.col - b.col : a.row - b.row);
      const first = boardToPixel(winLine[0].row, winLine[0].col);
      const last = boardToPixel(winLine[winLine.length - 1].row, winLine[winLine.length - 1].col);
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
      ctx.restore();
    }

    // Last move indicator
    if (lastMove && !winLine) {
      const p = boardToPixel(lastMove.row, lastMove.col);
      ctx.save();
      ctx.strokeStyle = '#ff6b35';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8;
      const size = cellSize * 0.2;
      ctx.strokeRect(p.x - size, p.y - size, size * 2, size * 2);
      ctx.restore();
    }
  }

  function drawStone(row, col, color) {
    const p = boardToPixel(row, col);
    const r = cellSize * 0.42;

    ctx.save();
    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1.5;
    ctx.shadowOffsetY = 1.5;

    if (color === BLACK) {
      const grad = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
      grad.addColorStop(0, '#555');
      grad.addColorStop(0.6, '#222');
      grad.addColorStop(1, '#111');
      ctx.fillStyle = grad;
    } else {
      const grad = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(0.5, '#f0ece4');
      grad.addColorStop(1, '#d8d0c4');
      ctx.fillStyle = grad;
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ===== Game Flow =====
  function updateTurnText() {
    if (gameOver) return;
    turnText.textContent = currentPlayer === BLACK ? '你的回合' : 'AI 思考中...';
  }

  function handlePlayerMove(row, col) {
    if (gameOver || currentPlayer !== BLACK) return;
    if (!inBounds(row, col) || board[row][col] !== EMPTY) return;

    initAudio();
    placeStone(row, col, BLACK);
    playStoneSound();
    drawBoard();

    if (checkWin(row, col, BLACK)) {
      gameOver = true;
      playWinSound();
      drawBoard();
      setTimeout(() => showResult('win'), 600);
      return;
    }
    if (isBoardFull()) {
      gameOver = true;
      drawBoard();
      setTimeout(() => showResult('draw'), 600);
      return;
    }

    currentPlayer = WHITE;
    updateTurnText();

    // AI turn with slight delay for UX
    setTimeout(() => {
      const move = aiMove();
      if (!move) return;

      placeStone(move.row, move.col, WHITE);
      playStoneSound();
      drawBoard();

      if (checkWin(move.row, move.col, WHITE)) {
        gameOver = true;
        playLoseSound();
        drawBoard();
        setTimeout(() => showResult('lose'), 600);
        return;
      }
      if (isBoardFull()) {
        gameOver = true;
        drawBoard();
        setTimeout(() => showResult('draw'), 600);
        return;
      }

      currentPlayer = BLACK;
      updateTurnText();
    }, 300);
  }

  function showResult(type) {
    if (type === 'win') {
      resultTitle.textContent = '你赢了';
      resultTitle.style.color = '#5ab87a';
      resultDesc.textContent = '恭喜，你击败了 AI';
    } else if (type === 'lose') {
      resultTitle.textContent = 'AI 赢了';
      resultTitle.style.color = '#e05555';
      resultDesc.textContent = '别灰心，再来一局';
    } else {
      resultTitle.textContent = '平局';
      resultTitle.style.color = '#d4a55a';
      resultDesc.textContent = '棋逢对手';
    }
    resultOverlay.classList.add('active');
  }

  function hideResult() {
    resultOverlay.classList.remove('active');
  }

  function showScreen(screen) {
    [titleScreen, gameScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }

  function startGame() {
    initAudio();
    createBoard();
    showScreen(gameScreen);
    resizeCanvas();
    updateTurnText();
    drawBoard();
  }

  function goToMenu() {
    hideResult();
    showScreen(titleScreen);
  }

  // ===== Input Handling =====
  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    let x, y;
    if (e.touches) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }
    // Scale to canvas logical size
    x = x * (canvasSize / rect.width);
    y = y * (canvasSize / rect.height);
    return {x, y};
  }

  // Hover preview
  let hoverPos = null;
  canvas.addEventListener('mousemove', (e) => {
    if (gameOver || currentPlayer !== BLACK) { 
      canvas.style.cursor = 'default';
      return; 
    }
    const {x, y} = getCanvasCoords(e);
    const pos = pixelToBoard(x, y);
    if (pos && board[pos.row][pos.col] === EMPTY) {
      canvas.style.cursor = 'pointer';
      hoverPos = pos;
      drawBoard();
      // Draw hover ghost
      const p = boardToPixel(pos.row, pos.col);
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(p.x, p.y, cellSize * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      canvas.style.cursor = 'default';
      if (hoverPos) {
        hoverPos = null;
        drawBoard();
      }
    }
  });

  canvas.addEventListener('mouseleave', () => {
    if (hoverPos) {
      hoverPos = null;
      drawBoard();
    }
    canvas.style.cursor = 'default';
  });

  // Click/Tap
  canvas.addEventListener('click', (e) => {
    const {x, y} = getCanvasCoords(e);
    const pos = pixelToBoard(x, y);
    if (pos) handlePlayerMove(pos.row, pos.col);
  });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const {x, y} = getCanvasCoords(e);
    const pos = pixelToBoard(x, y);
    if (pos) handlePlayerMove(pos.row, pos.col);
  }, {passive: false});

  // ===== Event Listeners =====

  // Difficulty selection
  document.querySelectorAll('[data-difficulty]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-difficulty]').forEach(b => b.classList.remove('btn-active'));
      btn.classList.add('btn-active');
      difficulty = btn.dataset.difficulty;
    });
  });

  // Start button
  document.getElementById('start-btn').addEventListener('click', startGame);

  // Game controls
  document.getElementById('undo-btn').addEventListener('click', () => {
    if (currentPlayer === BLACK && !gameOver) {
      undoMove();
    }
  });
  document.getElementById('restart-btn').addEventListener('click', () => {
    hideResult();
    startGame();
  });
  document.getElementById('menu-btn').addEventListener('click', goToMenu);

  // Result overlay buttons
  document.getElementById('play-again-btn').addEventListener('click', () => {
    hideResult();
    startGame();
  });
  document.getElementById('back-menu-btn').addEventListener('click', goToMenu);

  // Sound toggle
  document.getElementById('sound-toggle').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    document.getElementById('sound-on-icon').style.display = soundEnabled ? 'block' : 'none';
    document.getElementById('sound-off-icon').style.display = soundEnabled ? 'none' : 'block';
  });

  // Resize
  window.addEventListener('resize', () => {
    if (gameScreen.classList.contains('active')) {
      resizeCanvas();
      drawBoard();
    }
  });

})();
