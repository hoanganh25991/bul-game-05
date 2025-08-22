/* Chiến Tranh Ngân Hà - Move with mouse or arrows, hold Space to shoot
   Canvas arcade shooter - Vanilla JS
*/
(() => {
  "use strict";

  // Early declarations to avoid TDZ before resize() calls updateScale
  var scale = 1;
  const BASE_H = 900;
  const TIME_SCALE = 1; // Base speed (no global slow); temporary slow-mo handled via time-vibe
  // Tuning multipliers/divisors
  // - FIRE_RATE_MULTIPLIER: tăng tốc độ bắn của người chơi lên gấp 5 lần (giảm thời gian hồi)
  // - ENEMY_SPEED_DIVISOR: giảm tốc độ di chuyển của quân địch (bao gồm Boss) xuống 1/5
  // - ENEMY_BULLET_SPEED_DIVISOR: giảm tốc độ đạn của địch xuống 1/5
  const FIRE_RATE_MULTIPLIER = 5;
  const ENEMY_SPEED_DIVISOR = 5;
  const ENEMY_BULLET_SPEED_DIVISOR = 5;

  // DOM
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  const overlay = document.getElementById("overlay");
  const gameoverEl = document.getElementById("gameover");
  const startBtn = document.getElementById("startBtn");
  const restartBtn = document.getElementById("restartBtn");
  const scoreEl = document.getElementById("score");
  const hpFill = document.getElementById("hpFill");
  const hpBar = document.querySelector(".hpbar");
  const finalScoreEl = document.getElementById("finalScore");

  // On-screen controls
  const fireBtn = document.getElementById("fireBtn");
  const mgBtn = document.getElementById("mgBtn");
  const missileBtn = document.getElementById("missileBtn");
  const joystick = document.getElementById("joystick");
  const joyKnob = joystick ? joystick.querySelector(".joy-stick") : null;

  // Joystick state (-1..1)
  const joy = { active: false, id: null, x: 0, y: 0 };

  function resetJoy() {
    joy.active = false;
    joy.id = null;
    joy.x = 0;
    joy.y = 0;
    if (joyKnob) joyKnob.style.transform = "translate(-50%, -50%)";
    if (joystick) joystick.setAttribute("aria-valuenow", "0");
  }

  function updateJoyFromPointer(e) {
    if (!joystick) return;
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const max = Math.min(rect.width, rect.height) * 0.5 - 8;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const cl = Math.min(len, max);
      dx = (dx / len) * cl;
      dy = (dy / len) * cl;
    } else {
      dx = 0; dy = 0;
    }
    joy.x = clamp(dx / max, -1, 1);
    joy.y = clamp(dy / max, -1, 1);
    if (joyKnob) {
      joyKnob.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
    }
    const magnitude = Math.min(1, Math.hypot(joy.x, joy.y));
    joystick.setAttribute("aria-valuenow", String(Math.round(magnitude * 100) / 100));
  }

  if (joystick) {
    joystick.addEventListener("pointerdown", (e) => {
      joy.active = true;
      joy.id = e.pointerId;
      updateJoyFromPointer(e);
      if (joystick.setPointerCapture) joystick.setPointerCapture(e.pointerId);
      e.preventDefault();
    }, { passive: false });
    joystick.addEventListener("pointermove", (e) => {
      if (!joy.active || e.pointerId !== joy.id) return;
      updateJoyFromPointer(e);
      e.preventDefault();
    }, { passive: false });
    const joyEnd = (e) => {
      if (e.pointerId !== joy.id) return;
      resetJoy();
      if (joystick.releasePointerCapture) joystick.releasePointerCapture(e.pointerId);
      e.preventDefault();
    };
    joystick.addEventListener("pointerup", joyEnd, { passive: false });
    joystick.addEventListener("pointercancel", joyEnd, { passive: false });
  }

  window.addEventListener("blur", resetJoy);

  const heldFirePointers = new Set();
  // Keyboard state for desktop controls (WASD/Arrows + Space to fire)
  const keys = { left: false, right: false, up: false, down: false };

  // Canvas size + DPR for crisp rendering
  let cw = 0,
    ch = 0,
    dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = window.innerWidth;
    ch = window.innerHeight;
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateScale();
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  // Utils
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  const rand = (min, max) => min + Math.random() * (max - min);
  const nowMs = () => performance.now();
  const dist2 = (x1, y1, x2, y2) => {
    const dx = x1 - x2,
      dy = y1 - y2;
    return dx * dx + dy * dy;
  };

  // Responsive scale helpers
  // BASE_H and scale declared above to avoid TDZ in resize()
  const gs = (v) => v * scale; // scale numeric to current screen
  function updateScale() {
    scale = clamp(ch / BASE_H, 0.7, 1.6);
  }
  function getHudHeight() {
    const hud = document.querySelector(".hud");
    return hud ? hud.offsetHeight : 56;
  }

  // Game state
  const MAX_LIVES = 100;
  const state = {
    running: false,
    score: 0,
    lives: MAX_LIVES,
    lastTs: 0,
    spawnTimer: 0,
    isFiring: false,
    t: 0, // seconds
    dead: false,
    deathTimer: 0,
    enemiesSpawned: 0,
    totalToSpawn: 30,
    won: false,
    bossSpawned: false,
    mgActive: false,
    mgTime: 0,
    mgDuration: 5,
    mgMultiplier: 3,
    timeVibeActive: false,
    timeVibeRemaining: 0,
    timeVibeFactor: 1,
    missileActive: false,
    missileTime: 0,
    missileDuration: 10,
    missileCd: 0,
  };

  // Player
  const player = {
    x: cw * 0.5,
    y: ch * 0.75,
    w: gs(28),
    h: gs(36),
    r: gs(14), // collision radius
    fireCooldown: 0,
    invUntil: 0,
  };
  const wingmen = [];
  const WINGMAN_OFFSETS = [
    { x: -80, y: 30 },
    { x: -40, y: 20 },
    { x: 40, y: 20 },
    { x: 80, y: 30 },
    { x: 0, y: 60 },
  ];

  // Entities
  const pBullets = []; // player's bullets
  const eBullets = []; // enemy bullets
  const enemies = [];
  const missiles = []; // homing missiles
  const particles = []; // explosion particles
  let boss = null; // Boss entity when present

  // Stars background
  let stars = [];
  function initStars() {
    const count = Math.floor((cw * ch) / 12000); // density
    stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * cw,
        y: Math.random() * ch,
        s: Math.random() * 1.2 + 0.3, // size
        v: Math.random() * 60 + 20, // speed
        a: Math.random() * 0.7 + 0.3, // alpha
      });
    }
  }
  initStars();

  // Difficulty curve
  function getDifficulty() {
    // scales with score and time
    const a = state.score / 1500;
    const b = state.t / 60;
    return clamp(0.3 + a + b * 0.6, 0.3, 3.0);
  }

  // HUD
  function updateHUD() {
    scoreEl.textContent = state.score.toString();
    const ratio = clamp(state.lives / MAX_LIVES, 0, 1);
    if (hpFill) hpFill.style.width = Math.round(ratio * 100) + "%";
    if (hpBar) {
      hpBar.setAttribute("aria-valuenow", String(state.lives));
      hpBar.setAttribute("aria-valuemax", String(MAX_LIVES));
    }
  }

  // Input


  window.addEventListener("blur", () => {
    state.isFiring = false;
  });
  window.addEventListener("contextmenu", (e) => e.preventDefault());

  // Desktop mouse controls on canvas: move with mouse, hold to fire
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse" && !state.dead) {
      const margin = gs(16);
      player.x = clamp(e.clientX, margin, cw - margin);
      player.y = clamp(e.clientY, margin + getHudHeight(), ch - margin);
    }
  }, { passive: true });

  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") {
      state.isFiring = true;
      e.preventDefault();
    }
  }, { passive: false });

  window.addEventListener("pointerup", (e) => {
    if (e.pointerType === "mouse") {
      // Release firing when mouse button released (unless fire button held)
      state.isFiring = heldFirePointers.size > 0;
    }
  }, { passive: true });

  // Remove on-screen joystick: no-op

  // Setup fire button to toggle continuous firing while pressed
  function fireDown(e) {
    heldFirePointers.add(e.pointerId);
    state.isFiring = heldFirePointers.size > 0;
    if (fireBtn) fireBtn.classList.add("active");
    e.preventDefault();
  }
  function fireUp(e) {
    if (heldFirePointers.has(e.pointerId)) {
      heldFirePointers.delete(e.pointerId);
      state.isFiring = heldFirePointers.size > 0;
      if (heldFirePointers.size === 0 && fireBtn) fireBtn.classList.remove("active");
    }
  }

  if (fireBtn) fireBtn.addEventListener("pointerdown", fireDown, { passive: false });
  window.addEventListener("pointerup", fireUp, { passive: false });
  window.addEventListener("pointercancel", fireUp, { passive: false });
  window.addEventListener("blur", () => {
    heldFirePointers.clear();
    state.isFiring = false;
    if (fireBtn) fireBtn.classList.remove("active");
    // reset keyboard state on focus loss
    keys.left = keys.right = keys.up = keys.down = false;
  });

  // Machine gun skill activation (Súng máy)
  function activateMG() {
    if (!state.running || state.dead) return;
    state.mgActive = true;
    state.mgTime = state.mgDuration;
    if (mgBtn) mgBtn.classList.add("active");
  }

  // Kích hoạt "rung động thời gian" (làm chậm thời gian tạm thời)
  function deactivateTimeVibe() {
    state.timeVibeActive = false;
    state.timeVibeRemaining = 0;
    state.timeVibeFactor = 1;
    if (mgBtn) mgBtn.classList.remove("active");
  }
  function activateTimeVibe(duration = 5, factor = 0.5) {
    if (!state.running || state.dead) return;
    // Chỉ cho phép một kỹ năng tối thượng hoạt động tại một thời điểm
    if (state.missileActive) deactivateMissiles();
    state.timeVibeActive = true;
    state.timeVibeRemaining = duration;
    state.timeVibeFactor = factor;
    if (mgBtn) mgBtn.classList.add("active");
  }

  // Kích hoạt "tên lửa truy đuổi" (bắn tên lửa tự tìm mục tiêu trong 10 giây)
  function deactivateMissiles() {
    state.missileActive = false;
    state.missileTime = 0;
    if (missileBtn) missileBtn.classList.remove("active");
  }
  function activateMissiles() {
    if (!state.running || state.dead) return;
    // Chỉ cho phép một kỹ năng tối thượng hoạt động tại một thời điểm
    if (state.timeVibeActive) deactivateTimeVibe();
    state.missileActive = true;
    state.missileTime = state.missileDuration;
    state.missileCd = 0;
    if (missileBtn) missileBtn.classList.add("active");
  }

  if (mgBtn) {
    const onTime = (e) => {
      activateTimeVibe(5, 0.5);
      e.preventDefault();
    };
    mgBtn.addEventListener("pointerdown", onTime, { passive: false });
    mgBtn.addEventListener("click", onTime);
  }
  if (missileBtn) {
    const onMissile = (e) => {
      activateMissiles();
      e.preventDefault();
    };
    missileBtn.addEventListener("pointerdown", onMissile, { passive: false });
    missileBtn.addEventListener("click", onMissile);
  }

  // Keyboard controls (WASD/Arrows to move, Space to fire)
  window.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "1": activateMissiles(); e.preventDefault(); break;
      case "2": activateTimeVibe(5, 0.5); e.preventDefault(); break;
      case "ArrowLeft": case "a": case "A": keys.left = true; e.preventDefault(); break;
      case "ArrowRight": case "d": case "D": keys.right = true; e.preventDefault(); break;
      case "ArrowUp": case "w": case "W": keys.up = true; e.preventDefault(); break;
      case "ArrowDown": case "s": case "S": keys.down = true; e.preventDefault(); break;
      case " ": case "Spacebar": state.isFiring = true; e.preventDefault(); break;
    }
  });
  window.addEventListener("keyup", (e) => {
    switch (e.key) {
      case "ArrowLeft": case "a": case "A": keys.left = false; break;
      case "ArrowRight": case "d": case "D": keys.right = false; break;
      case "ArrowUp": case "w": case "W": keys.up = false; break;
      case "ArrowDown": case "s": case "S": keys.down = false; break;
      case " ": case "Spacebar": state.isFiring = false; break;
    }
  });


  // Game control
  function resetGame() {
    state.score = 0;
    state.lives = MAX_LIVES;
    state.lastTs = 0;
    state.spawnTimer = 0;
    state.isFiring = false;
    state.t = 0;
    state.dead = false;
    state.deathTimer = 0;
    state.enemiesSpawned = 0;
    state.totalToSpawn = 150; // Tăng gấp 5 (Số địch tham chiếu của màn 1)
    state.won = false;
    state.mgActive = false;
    state.mgTime = 0;
    if (mgBtn) mgBtn.classList.remove("active");
    state.missileActive = false;
    state.missileTime = 0;
    state.missileCd = 0;
    if (missileBtn) missileBtn.classList.remove("active");
    enemies.length = 0;
    pBullets.length = 0;
    eBullets.length = 0;
    missiles.length = 0;
    particles.length = 0;
    boss = null;
    state.bossSpawned = false;
    player.x = cw * 0.5;
    player.y = ch * 0.75;
    // Apply responsive scale to player size
    player.w = gs(28);
    player.h = gs(36);
    player.r = gs(14);
    player.fireCooldown = 0;
    player.invUntil = 0;
    // Setup wingmen formation around player
    wingmen.length = 0;
    for (let i = 0; i < WINGMAN_OFFSETS.length; i++) {
      const off = WINGMAN_OFFSETS[i];
      wingmen.push({ x: player.x + off.x * scale, y: player.y + off.y * scale });
    }
    initStars();
    updateHUD();
  }

  function startGame() {
    resetGame();
    state.running = true;
    overlay.classList.add("hidden");
    gameoverEl.classList.add("hidden");
    requestAnimationFrame(loop);
  }

  function gameOver() {
    state.running = false;
    state.isFiring = false;
    finalScoreEl.textContent = state.score.toString();
    const h1 = gameoverEl ? gameoverEl.querySelector("h1") : null;
    if (h1) h1.textContent = "Thua cuộc!";
    gameoverEl.classList.remove("hidden");
  }

  // Hiển thị chiến thắng màn 1
  function winGame() {
    state.running = false;
    state.won = true;
    state.isFiring = false;
    finalScoreEl.textContent = state.score.toString();
    const h1 = gameoverEl ? gameoverEl.querySelector("h1") : null;
    if (h1) h1.textContent = "Chiến thắng! Bạn đã hoàn thành nhiệm vụ";
    gameoverEl.classList.remove("hidden");
  }

if (startBtn) {
  // Touch: pointerdown for immediate response
  startBtn.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    tryStartFromUI(e);
    e.preventDefault();
  }, { passive: false });
  // Desktop and keyboard: click event
  startBtn.addEventListener("click", (e) => {
    tryStartFromUI(e);
  });
}
if (restartBtn) {
  restartBtn.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    tryStartFromUI(e);
    e.preventDefault();
  }, { passive: false });
  restartBtn.addEventListener("click", (e) => {
    tryStartFromUI(e);
  });
}

  // Extra start triggers for robustness: click anywhere on overlay, or press Enter/Space
  function tryStartFromUI(e) {
    if (state.running) return;
    const startVisible = overlay && !overlay.classList.contains("hidden");
    const gameoverVisible = gameoverEl && !gameoverEl.classList.contains("hidden");
    if (startVisible || gameoverVisible) {
      startGame();
      if (e) e.preventDefault();
    }
  }
  if (overlay) {
    overlay.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      tryStartFromUI(e);
      e.preventDefault();
    }, { passive: false });
    // Desktop: click anywhere on overlay to start
    overlay.addEventListener("click", (e) => {
      tryStartFromUI(e);
    });
  }

  // Keyboard: Enter or Space starts the game when menu/overlay is visible
  window.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      if (!state.running) {
        tryStartFromUI(e);
        e.preventDefault();
      }
    }
  });

  // Spawning
  function spawnEnemy() {
    // Dừng sinh thêm nếu trùm đã xuất hiện
    if (state.bossSpawned || boss) return;

    const d = getDifficulty();
    const size = gs(rand(22, 34));
    const x = rand(size, cw - size);
    const vy = (gs(rand(60, 120)) * (0.8 + d * 0.4)) / ENEMY_SPEED_DIVISOR;
    const hp = Math.random() < 0.2 * d ? 2 : 1;
    enemies.push({
      x,
      y: -size - gs(10),
      w: size,
      h: size * 1.1,
      r: size * 0.55,
      vy,
      t: Math.random() * Math.PI * 2, // phase for lateral motion
      amp: (gs(rand(20, 60)) * (0.7 + d * 0.2)) / ENEMY_SPEED_DIVISOR,
      fireCd: rand(0.6, 1.8) / Math.sqrt(0.6 + d),
      fireTimer: rand(0.1, 0.6),
      hp,
    });

    state.enemiesSpawned += 1;
  }

  // Shooting
  function shootFrom(sx, sy, sh = player) {
    const speed = gs(84); // chậm gấp 5 lần so với trước
    pBullets.push({ x: sx - gs(6), y: sy - sh.h * 0.5, vx: 0, vy: -speed, r: gs(3.2) });
    pBullets.push({ x: sx + gs(6), y: sy - sh.h * 0.5, vx: 0, vy: -speed, r: gs(3.2) });
  }
  function shootPlayer() {
    shootFrom(player.x, player.y, player);
  }

  function shootEnemy(ex, ey) {
    // aim at player with some slight spread
    const d = Math.atan2(player.y - ey, player.x - ex) + rand(-0.06, 0.06);
    const spd = gs(280 + getDifficulty() * 90) / ENEMY_BULLET_SPEED_DIVISOR;
    const vx = Math.cos(d) * spd;
    const vy = Math.sin(d) * spd;
    eBullets.push({ x: ex, y: ey, vx, vy, r: gs(3.5) });
  }

  // Spawn a homing missile from player
  function spawnMissile() {
    const speed = gs(520);
    const turn = 6.0; // rad/s turn rate
    const r = gs(5);
    missiles.push({
      x: player.x,
      y: player.y - player.h * 0.6,
      vx: 0,
      vy: -speed,
      speed,
      turn,
      r
    });
  }

  // Explosions / Particles
  function spawnExplosion(x, y, count = 30, kind = "enemy") {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = gs(rand(60, kind === "player" ? 420 : 300));
      const vx = Math.cos(ang) * spd;
      const vy = Math.sin(ang) * spd;
      const life = rand(0.4, kind === "player" ? 1.2 : 0.8);
      const size = gs(rand(2, kind === "player" ? 5 : 4));
      const palette =
        kind === "player"
          ? ["#b7f7ff", "#2ee6ff", "#e9faff", "#ffffff"]
          : ["#FFB347", "#FF8C00", "#FFD27F", "#ffffff"];
      const color = palette[Math.floor(Math.random() * palette.length)];
      particles.push({ x, y, vx, vy, life, max: life, size, color });
    }
  }

  function explodeEnemy(e) {
    const count = Math.floor(16 + e.r * 0.9);
    spawnExplosion(e.x, e.y, count, "enemy");
  }

  function triggerPlayerDeath() {
    if (state.dead) return;
    state.dead = true;
    state.deathTimer = 1.2;
    state.isFiring = false;
    spawnExplosion(player.x, player.y, 90, "player");
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.vy += 140 * dt; // slight gravity
      if (p.x < -60 || p.x > cw + 60 || p.y < -60 || p.y > ch + 60) {
        particles.splice(i, 1);
      }
    }
  }

  function drawParticles() {
    for (let p of particles) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + 0.4 * a), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMissiles() {
    for (let m of missiles) {
      const ang = Math.atan2(m.vy, m.vx);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(ang + Math.PI * 0.5);

      // Glow
      const g = ctx.createRadialGradient(0, 0, 3, 0, 0, 18);
      g.addColorStop(0, "rgba(46,230,255,0.2)");
      g.addColorStop(1, "rgba(46,230,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();

      // Body (triangle rocket)
      ctx.fillStyle = "#e9faff";
      ctx.beginPath();
      ctx.moveTo(0, -gs(10));
      ctx.lineTo(-gs(6), gs(10));
      ctx.lineTo(gs(6), gs(10));
      ctx.closePath();
      ctx.fill();

      // Thruster
      ctx.fillStyle = "#2ee6ff";
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(-gs(3), gs(10));
      ctx.lineTo(gs(3), gs(10));
      ctx.lineTo(0, gs(16) + Math.sin(state.t * 60) * 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.restore();
    }
  }

  // Update + Draw
  function update(dt) {
    state.t += dt;
    const dtEnemy = state.mgActive ? dt / 3 : dt;

    if (state.dead) {
      state.deathTimer -= dt;
      if (state.deathTimer <= 0) {
        gameOver();
        return;
      }
    }

    // Stars
    for (let s of stars) {
      s.y += s.v * dt;
      if (s.y > ch + 2) {
        s.y = -2;
        s.x = Math.random() * cw;
        s.v = Math.random() * 60 + 20;
        s.s = Math.random() * 1.2 + 0.3;
        s.a = Math.random() * 0.7 + 0.3;
      }
    }

    // Player movement via on-screen joystick or keyboard
    const margin = gs(16);
    if (!state.dead) {
      const spd = gs(420);
      // Joystick
      if (joy.active) {
        player.x += joy.x * spd * dt;
        player.y += joy.y * spd * dt;
      }
      // Keyboard (WASD/Arrows)
      const kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const ky = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      if (kx || ky) {
        const len = Math.hypot(kx, ky) || 1;
        player.x += (kx / len) * spd * dt;
        player.y += (ky / len) * spd * dt;
      }
      player.x = clamp(player.x, margin, cw - margin);
      player.y = clamp(player.y, margin + getHudHeight(), ch - margin);
    }

    // Wingmen follow formation
    for (let i = 0; i < wingmen.length; i++) {
      const wm = wingmen[i];
      const off = WINGMAN_OFFSETS[i % WINGMAN_OFFSETS.length];
      const tx = clamp(player.x + off.x * scale, margin, cw - margin);
      const ty = clamp(player.y + off.y * scale, margin + getHudHeight(), ch - margin);
      const lerp2 = 1 - Math.pow(0.0001, dt);
      wm.x += (tx - wm.x) * lerp2;
      wm.y += (ty - wm.y) * lerp2;
    }

    // Player firing
    if (!state.dead) {
    player.fireCooldown -= dt;
    if (state.isFiring && player.fireCooldown <= 0) {
      shootPlayer();
      for (let wm of wingmen) {
        shootFrom(wm.x, wm.y, player);
      }
      const baseInterval = 0.14; // seconds
      let interval = Math.max(0.07, baseInterval - getDifficulty() * 0.02);
      // Apply faster fire rate (gấp 5 lần)
      interval = interval / FIRE_RATE_MULTIPLIER;
      if (state.mgActive) interval = Math.max(0.035 / FIRE_RATE_MULTIPLIER, interval / state.mgMultiplier);
      player.fireCooldown = interval;
    }
    }

    // Update machine gun timer
    if (state.mgActive) {
      state.mgTime -= dt;
      if (state.mgTime <= 0) {
        state.mgActive = false;
        state.mgTime = 0;
        if (mgBtn) mgBtn.classList.remove("active");
      }
    }

    // Homing missile ability timer and auto-spawn
    if (state.missileActive) {
      state.missileTime -= dt;
      state.missileCd -= dt;
      if (state.missileCd <= 0) {
        spawnMissile();
        state.missileCd = 0.3; // spawn every 0.3s
      }
      if (state.missileTime <= 0) {
        deactivateMissiles();
      }
    }

    // Spawn enemies (tiếp tục cho đến khi gặp trùm)
    if (!state.dead && !boss && !state.bossSpawned) {
    state.spawnTimer -= dtEnemy;
    if (state.spawnTimer <= 0) {
      // Spawn 10 enemies per wave (5x tăng quân địch)
      for (let i = 0; i < 10; i++) {
        spawnEnemy();
      }
      const base = rand(0.4, 1.0);
      state.spawnTimer = Math.max(0.2, base / (0.7 + getDifficulty() * 0.6));
    }
    }

    // Update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.t += dtEnemy;
      e.y += e.vy * dtEnemy;
      e.x += Math.sin(e.t * 2.0) * e.amp * dtEnemy;

      // Fire
      e.fireTimer -= dtEnemy;
      if (e.fireTimer <= 0) {
        shootEnemy(e.x, e.y + e.h * 0.2);
        e.fireTimer = e.fireCd;
      }

      // Offscreen cleanup
      if (e.y - e.h > ch + 40 || e.x < -80 || e.x > cw + 80) {
        enemies.splice(i, 1);
      }
    }

    // Update boss
    if (boss) {
      updateBoss(dtEnemy);
    }

    // Update bullets
    for (let i = pBullets.length - 1; i >= 0; i--) {
      const b = pBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -20 || b.y > ch + 20 || b.x < -20 || b.x > cw + 20) {
        pBullets.splice(i, 1);
      }
    }
    for (let i = eBullets.length - 1; i >= 0; i--) {
      const b = eBullets[i];

      // Boss laser beam handling (vertical beam from boss downward)
      if (b.type === "laser") {
        if (b.phase === "charge") {
          b.charge -= dtEnemy;
          if (b.charge <= 0) {
            b.phase = "fire";
          }
        } else {
          // fire phase
          b.fire -= dtEnemy;
          // Damage if player intersects beam column (invincibility window in damagePlayer handles rate)
          if (!state.dead) {
            if (player.y > b.y && Math.abs(player.x - b.x) <= b.width * 0.5) {
              damagePlayer();
            }
          }
          if (b.fire <= 0) {
            eBullets.splice(i, 1);
            continue;
          }
        }
        // Laser doesn't move; keep it until finished
        continue;
      }

      // Energy orb with timed explosion
      if (b.type === "orb") {
        // slow drifting
        b.vx *= 0.995;
        b.vy *= 0.995;
        b.x += b.vx * dtEnemy;
        b.y += b.vy * dtEnemy;
        b.fuse -= dtEnemy;

        const off = (b.x < -30 || b.x > cw + 30 || b.y < -30 || b.y > ch + 30);
        if (b.fuse <= 0 || off) {
          // Explode here with AoE
          if (!state.dead) {
            const rr = (b.explodeR + player.r) * (b.explodeR + player.r);
            if (dist2(b.x, b.y, player.x, player.y) <= rr) {
              damagePlayer();
            }
          }
          spawnExplosion(b.x, b.y, Math.floor(40 + b.explodeR * 0.4), "enemy");
          eBullets.splice(i, 1);
          continue;
        }
        continue;
      }

      // Default enemy bullet
      b.x += b.vx * dtEnemy;
      b.y += b.vy * dtEnemy;
      if (b.y < -20 || b.y > ch + 20 || b.x < -20 || b.x > cw + 20) {
        eBullets.splice(i, 1);
      }
    }

    // Update missiles: steer towards nearest target and handle collisions
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];

      // Acquire nearest target (enemy or boss)
      let target = null;
      let bestD2 = Infinity;
      if (boss) {
        const d2b = dist2(m.x, m.y, boss.x, boss.y);
        if (d2b < bestD2) { bestD2 = d2b; target = boss; }
      }
      for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k];
        const d2 = dist2(m.x, m.y, e.x, e.y);
        if (d2 < bestD2) { bestD2 = d2; target = e; }
      }

      // Steering
      const cur = Math.atan2(m.vy, m.vx);
      const desired = target ? Math.atan2((target.y - m.y), (target.x - m.x)) : -Math.PI * 0.5;
      let diff = desired - cur;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxTurn = m.turn * dt;
      const ang = cur + clamp(diff, -maxTurn, maxTurn);

      m.vx = Math.cos(ang) * m.speed;
      m.vy = Math.sin(ang) * m.speed;
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      // Collide with enemies
      let hit = false;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const rr = (e.r + m.r) * (e.r + m.r);
        if (dist2(m.x, m.y, e.x, e.y) <= rr) {
          e.hp -= 3;
          if (e.hp <= 0) {
            explodeEnemy(e);
            enemies.splice(j, 1);
            state.score += 100;
            updateHUD();
          }
          spawnExplosion(m.x, m.y, 24, "enemy");
          missiles.splice(i, 1);
          hit = true;
          break;
        }
      }
      if (hit) continue;

      // Collide with boss
      if (boss) {
        const rrB = (boss.r + m.r) * (boss.r + m.r);
        if (dist2(m.x, m.y, boss.x, boss.y) <= rrB) {
          boss.hp -= 8;
          spawnExplosion(m.x, m.y, 35, "enemy");
          missiles.splice(i, 1);
          if (boss.hp <= 0) {
            spawnExplosion(boss.x, boss.y, 200, "enemy");
            boss = null;
            state.score += 2000;
            updateHUD();
          }
          continue;
        }
      }

      // Off-screen cleanup
      if (m.y < -40 || m.y > ch + 40 || m.x < -40 || m.x > cw + 40) {
        missiles.splice(i, 1);
      }
    }

    updateParticles(dt);

    // Collisions: player bullets vs enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      let hit = false;
      for (let j = pBullets.length - 1; j >= 0; j--) {
        const b = pBullets[j];
        const rr = (e.r + b.r) * (e.r + b.r);
        if (dist2(e.x, e.y, b.x, b.y) <= rr) {
          pBullets.splice(j, 1);
          e.hp -= 1;
          hit = true;
          if (e.hp <= 0) break;
        }
      }
      if (e.hp <= 0) {
        explodeEnemy(e);
        enemies.splice(i, 1);
        state.score += 100;
        updateHUD();
        continue;
      }
      // Enemy collides with player body
      const rr2 = (e.r + player.r) * (e.r + player.r);
      if (!state.dead && dist2(e.x, e.y, player.x, player.y) <= rr2) {
        damagePlayer();
        explodeEnemy(e);
        enemies.splice(i, 1);
      }
    }

    // Collisions: player bullets vs boss
    if (boss) {
      for (let j = pBullets.length - 1; j >= 0; j--) {
        const b = pBullets[j];
        const rrB = (boss.r + b.r) * (boss.r + b.r);
        if (dist2(boss.x, boss.y, b.x, b.y) <= rrB) {
          pBullets.splice(j, 1);
          boss.hp -= 1;
          if (boss.hp <= 0) {
            spawnExplosion(boss.x, boss.y, 200, "enemy");
            boss = null;
            state.score += 2000;
            updateHUD();
            if (!state.won) {
              winGame();
              return;
            }
          }
        }
      }
      // Boss collides with player body
      const rrBody = (boss.r + player.r) * (boss.r + player.r);
      if (!state.dead && dist2(boss.x, boss.y, player.x, player.y) <= rrBody) {
        damagePlayer();
      }
    }

    // Collisions: enemy bullets vs player
    for (let i = eBullets.length - 1; i >= 0; i--) {
      const b = eBullets[i];
      if (b.type === "laser") continue; // laser damage handled during update
      const rr = (player.r + b.r) * (player.r + b.r);
      if (!state.dead && dist2(player.x, player.y, b.x, b.y) <= rr) {
        if (b.type === "orb") {
          // visual pop on direct hit
          spawnExplosion(b.x, b.y, Math.floor(40 + (b.explodeR || gs(90)) * 0.4), "enemy");
        }
        eBullets.splice(i, 1);
        damagePlayer();
      }
    }

    // Boss trigger theo điểm: đạt 5000 điểm sẽ gặp trùm; hạ trùm là thắng
    if (!state.dead && !state.won) {
      if (!state.bossSpawned && !boss && state.score >= 5000) {
        spawnBoss();
      } else if (state.bossSpawned && !boss) {
        winGame();
        return;
      }
    }
  }

  function damagePlayer() {
    const t = nowMs();
    if (t < player.invUntil) return; // invincible window
    state.lives -= 1;
    player.invUntil = t + 1200;
    updateHUD();
    if (state.lives <= 0) {
      triggerPlayerDeath();
    }
  }

  function draw() {
    // Clear
    ctx.clearRect(0, 0, cw, ch);

    // Stars
    for (let s of stars) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = "#a8f0ff";
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // Player bullets
    ctx.fillStyle = "#2ee6ff";
    for (let b of pBullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Homing missiles
    drawMissiles();

    // Enemy bullets (normal, orbs, lasers)
    for (let b of eBullets) {
      if (b.type === "laser") {
        const beamW = b.phase === "fire" ? b.width : Math.max(2, b.width * 0.35);
        const grad = ctx.createLinearGradient(b.x, b.y, b.x, ch);
        grad.addColorStop(0, "rgba(59,130,246,0.9)");
        grad.addColorStop(1, "rgba(59,130,246,0.0)");
        ctx.save();
        ctx.globalAlpha = b.phase === "charge" ? 0.6 : 1.0;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.rect(b.x - beamW * 0.5, b.y, beamW, ch - b.y);
        ctx.fill();
        // bright core
        ctx.globalAlpha = b.phase === "charge" ? 0.35 : 0.9;
        ctx.fillStyle = "rgba(219,234,254,0.95)";
        ctx.fillRect(b.x - Math.max(1, beamW * 0.15), b.y, Math.max(2, beamW * 0.3), ch - b.y);
        ctx.restore();
      } else if (b.type === "orb") {
        const a = Math.max(0, b.fuse / b.maxFuse);
        const glowR = b.r + gs(14) * (0.5 + 0.5 * a);
        const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.25, b.x, b.y, glowR);
        g.addColorStop(0, "rgba(219,234,254,0.95)");
        g.addColorStop(1, "rgba(59,130,246,0.25)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, glowR, 0, Math.PI * 2);
        ctx.fill();
        // core
        ctx.fillStyle = "#3b82f6";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#3b82f6";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Enemies
    for (let e of enemies) {
      drawEnemy(e);
    }

    // Boss
    if (boss) {
      drawBoss(boss);
    }

    // Explosions
    drawParticles();

    // Wingmen
    for (let wm of wingmen) {
      drawWingman(wm);
    }

    // Player
    if (!state.dead) drawPlayer();
  }

  function drawPlayer() {
    const t = nowMs();
    const flicker = t < player.invUntil && Math.floor(t / 100) % 2 === 0;
    if (flicker) return; // blink during invincibility

    const { x, y, w, h } = player;

    // Ship body (triangle)
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#b7f7ff";
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1;

    // Glow
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 28);
    g.addColorStop(0, "rgba(46,230,255,0.25)");
    g.addColorStop(1, "rgba(46,230,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();

    // Thruster flame
    ctx.fillStyle = "#2ee6ff";
    ctx.beginPath();
    ctx.moveTo(-6, h * 0.36);
    ctx.lineTo(6, h * 0.36);
    ctx.lineTo(0, h * 0.6 + Math.sin(state.t * 40) * 2);
    ctx.closePath();
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Body
    ctx.fillStyle = "#e9faff";
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.5);
    ctx.lineTo(-w * 0.5, h * 0.5);
    ctx.lineTo(w * 0.5, h * 0.5);
    ctx.closePath();
    ctx.fill();

    // Canopy
    ctx.fillStyle = "#7cd6ff";
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.2, 6.5, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wings
    ctx.fillStyle = "#bdeaff";
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, h * 0.2);
    ctx.lineTo(-w * 0.85, h * 0.45);
    ctx.lineTo(-w * 0.25, h * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.2);
    ctx.lineTo(w * 0.85, h * 0.45);
    ctx.lineTo(w * 0.25, h * 0.45);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawWingman(wm) {
    const w = 20, h = 26;
    ctx.save();
    ctx.translate(wm.x, wm.y);

    // Glow
    const g = ctx.createRadialGradient(0, 0, 3, 0, 0, 20);
    g.addColorStop(0, "rgba(46,230,255,0.18)");
    g.addColorStop(1, "rgba(46,230,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = "#c9fbff";
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.5);
    ctx.lineTo(-w * 0.5, h * 0.5);
    ctx.lineTo(w * 0.5, h * 0.5);
    ctx.closePath();
    ctx.fill();

    // Canopy
    ctx.fillStyle = "#8fe4ff";
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.2, 5, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);

    // glow
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, e.r + 10);
    g.addColorStop(0, "rgba(59,130,246,0.25)");
    g.addColorStop(1, "rgba(59,130,246,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 10, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillStyle = "#60a5fa";
    const w = e.w,
      h = e.h;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.5);
    ctx.lineTo(-w * 0.45, -h * 0.1);
    ctx.lineTo(-w * 0.35, h * 0.5);
    ctx.lineTo(w * 0.35, h * 0.5);
    ctx.lineTo(w * 0.45, -h * 0.1);
    ctx.closePath();
    ctx.fill();

    // cockpit
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.2, w * 0.18, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Boss logic
  function spawnBoss() {
    const entryY = Math.max(gs(150), getHudHeight() + gs(120));
    boss = {
      x: cw * 0.5,
      y: -gs(120),
      w: gs(140),
      h: gs(120),
      r: gs(60),
      maxHp: 10000,
      hp: 10000,
      t: 0,
      entryY,
      entering: true,
      orbTimer: 1.2,
      laserTimer: 3.0,
    };
    state.bossSpawned = true;
  }
  function updateBoss(dt) {
    if (!boss) return;
    boss.t += dt;
    if (boss.entering) {
      boss.y += (gs(120) * dt) / ENEMY_SPEED_DIVISOR;
      if (boss.y >= boss.entryY) {
        boss.y = boss.entryY;
        boss.entering = false;
      }
    } else {
      const tx = cw * 0.5 + Math.sin(boss.t * 0.7) * (gs(180) / ENEMY_SPEED_DIVISOR);
      const lerp = 1 - Math.pow(0.0001, dt);
      boss.x += (tx - boss.x) * lerp;
    }
    // Orbs
    boss.orbTimer -= dt;
    if (boss.orbTimer <= 0) {
      const d = Math.atan2(player.y - boss.y, player.x - boss.x) + rand(-0.05, 0.05);
      const spd = gs(160) / ENEMY_BULLET_SPEED_DIVISOR;
      const vx = Math.cos(d) * spd;
      const vy = Math.sin(d) * spd;
      const r = gs(12);
      const fuse = 1.6;
      const explodeR = gs(90);
      eBullets.push({ type: "orb", x: boss.x, y: boss.y + boss.h * 0.4, vx, vy, r, fuse, maxFuse: fuse, explodeR });
      boss.orbTimer = rand(0.9, 1.6);
    }
    // Laser
    boss.laserTimer -= dt;
    if (boss.laserTimer <= 0 && !eBullets.some(b => b.type === "laser")) {
      const width = gs(40);
      eBullets.push({ type: "laser", x: boss.x, y: boss.y + boss.h * 0.55, width, phase: "charge", charge: 0.8, fire: 1.2 });
      boss.laserTimer = rand(5.0, 7.5);
    }
  }
  function drawBoss(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    // glow
    const g = ctx.createRadialGradient(0, 0, 6, 0, 0, b.r + 14);
    g.addColorStop(0, "rgba(59,130,246,0.28)");
    g.addColorStop(1, "rgba(59,130,246,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, b.r + 14, 0, Math.PI * 2);
    ctx.fill();

    // body
    const w = b.w, h = b.h;
    ctx.fillStyle = "#60a5fa";
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.55);
    ctx.lineTo(-w * 0.6, -h * 0.05);
    ctx.lineTo(-w * 0.45, h * 0.55);
    ctx.lineTo(w * 0.45, h * 0.55);
    ctx.lineTo(w * 0.6, -h * 0.05);
    ctx.closePath();
    ctx.fill();

    // cockpit
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.15, w * 0.22, h * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();

    // turrets
    ctx.fillStyle = "#dbeafe";
    ctx.fillRect(-w * 0.4, h * 0.3, w * 0.12, h * 0.12);
    ctx.fillRect(w * 0.28, h * 0.3, w * 0.12, h * 0.12);

    ctx.restore();

    // HP bar
    ctx.save();
    const barW = Math.min(cw * 0.6, gs(600));
    const barH = gs(10);
    const bx = (cw - barW) * 0.5;
    const by = getHudHeight() + gs(10);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = "#3b82f6";
    const ratio = clamp(b.hp / (b.maxHp || 1200), 0, 1);
    ctx.fillRect(bx, by, barW * ratio, barH);
    // segment separators (10 segments)
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 1; i < 10; i++) {
      const x = bx + (barW * i) / 10;
      ctx.fillRect(Math.round(x) - 1, by, 2, barH);
    }
    ctx.restore();
  }

  // Main loop
  function loop(ts) {
    if (!state.running) return;
    if (!state.lastTs) state.lastTs = ts;
    let dt = (ts - state.lastTs) / 1000;
    state.lastTs = ts;
    // cap dt to avoid huge steps on tab switch
    dt = Math.min(dt, 0.033);

    // Đếm lùi thời gian hiệu ứng "rung động thời gian" theo giây thực
    if (state.timeVibeActive) {
      state.timeVibeRemaining -= dt;
      if (state.timeVibeRemaining <= 0) {
        deactivateTimeVibe();
      }
    }
    const tScale = state.timeVibeActive ? state.timeVibeFactor : 1;

    update(dt * tScale);
    draw();
    requestAnimationFrame(loop);
  }

  // Kick off in menu state
  overlay.classList.remove("hidden");
})();
