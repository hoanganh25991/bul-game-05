/* Chiến Tranh Ngân Hà - Move with mouse or arrows, hold Space to shoot
   Canvas arcade shooter - Vanilla JS
*/
(() => {
  "use strict";

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
  const joystickEl = document.getElementById("joystick");
  const joyStickKnob = joystickEl?.querySelector(".joy-stick");
  const fireBtn = document.getElementById("fireBtn");

  const joystick = {
    active: false,
    dx: 0,
    dy: 0,
    pointerId: null,
  };

  const heldFirePointers = new Set();

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
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  // Utils
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const rand = (min, max) => min + Math.random() * (max - min);
  const nowMs = () => performance.now();
  const dist2 = (x1, y1, x2, y2) => {
    const dx = x1 - x2,
      dy = y1 - y2;
    return dx * dx + dy * dy;
  };

  // Game state
  const MAX_LIVES = 3;
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
  };

  // Player
  const player = {
    x: cw * 0.5,
    y: ch * 0.75,
    w: 28,
    h: 36,
    r: 14, // collision radius
    fireCooldown: 0,
    invUntil: 0,
  };
  const pointer = { x: player.x, y: player.y };
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
  const particles = []; // explosion particles

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
    if (hpBar) hpBar.setAttribute("aria-valuenow", String(state.lives));
  }

  // Input
  function updatePointerFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
  }

  canvas.addEventListener("pointermove", (e) => {
    updatePointerFromEvent(e);
  });

  window.addEventListener("pointerdown", (e) => {
    if (!state.running) return;
    // Mouse no longer controls firing; only update pointer position
    updatePointerFromEvent(e);
  });
  window.addEventListener("pointerup", (e) => {
    if (!state.running) return;
  });
  window.addEventListener("blur", () => {
    state.isFiring = false;
  });
  window.addEventListener("contextmenu", (e) => e.preventDefault());

  // Setup on-screen joystick
  function joyUpdateFromEvent(e) {
    if (!joystickEl || !joystick.active || e.pointerId !== joystick.pointerId) return;
    const rect = joystickEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const knobR = joyStickKnob ? joyStickKnob.offsetWidth * 0.5 : 0;
    const maxR = Math.max(10, Math.min(rect.width, rect.height) * 0.5 - knobR);

    let dx = e.clientX - cx;
    let dy = e.clientY - cy;

    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const ratio = Math.min(1, len / maxR);
      dx = (dx / len) * ratio;
      dy = (dy / len) * ratio;
    } else {
      dx = 0;
      dy = 0;
    }

    joystick.dx = clamp(dx, -1, 1);
    joystick.dy = clamp(dy, -1, 1);

    if (joyStickKnob) {
      const px = joystick.dx * maxR;
      const py = joystick.dy * maxR;
      joyStickKnob.style.transform = "translate(calc(-50% + " + px + "px), calc(-50% + " + py + "px))";
    }
  }

  function joyStart(e) {
    if (!joystickEl || joystick.active) return;
    joystick.active = true;
    joystick.pointerId = e.pointerId;
    joystick.dx = 0;
    joystick.dy = 0;
    if (joystickEl.setPointerCapture) {
      try { joystickEl.setPointerCapture(e.pointerId); } catch {}
    }
    joyUpdateFromEvent(e);
    e.preventDefault();
  }

  function joyMove(e) {
    if (!joystick.active) return;
    joyUpdateFromEvent(e);
    e.preventDefault();
  }

  function joyEnd(e) {
    if (!joystick.active || e.pointerId !== joystick.pointerId) return;
    joystick.active = false;
    joystick.pointerId = null;
    joystick.dx = 0;
    joystick.dy = 0;
    if (joyStickKnob) {
      joyStickKnob.style.transform = "translate(-50%, -50%)";
    }
    e.preventDefault();
  }

  joystickEl?.addEventListener("pointerdown", joyStart, { passive: false });
  window.addEventListener("pointermove", joyMove, { passive: false });
  window.addEventListener("pointerup", joyEnd, { passive: false });
  window.addEventListener("pointercancel", joyEnd, { passive: false });
  window.addEventListener("blur", () => {
    // reset joystick on blur
    joystick.active = false;
    joystick.pointerId = null;
    joystick.dx = 0;
    joystick.dy = 0;
    if (joyStickKnob) joyStickKnob.style.transform = "translate(-50%, -50%)";
  });

  // Setup fire button to toggle continuous firing while pressed
  function fireDown(e) {
    heldFirePointers.add(e.pointerId);
    state.isFiring = heldFirePointers.size > 0;
    fireBtn?.classList.add("active");
    e.preventDefault();
  }
  function fireUp(e) {
    if (heldFirePointers.has(e.pointerId)) {
      heldFirePointers.delete(e.pointerId);
      state.isFiring = heldFirePointers.size > 0;
      if (heldFirePointers.size === 0) fireBtn?.classList.remove("active");
    }
  }

  fireBtn?.addEventListener("pointerdown", fireDown, { passive: false });
  window.addEventListener("pointerup", fireUp, { passive: false });
  window.addEventListener("pointercancel", fireUp, { passive: false });
  window.addEventListener("blur", () => {
    heldFirePointers.clear();
    state.isFiring = false;
    fireBtn?.classList.remove("active");
  });

  // Keyboard input (arrow keys)
  const keys = { left: false, right: false, up: false, down: false };
  function handleKey(e, down) {
    if (!state.running) return;
    // Space to fire on hold
    if (e.code === "Space" || e.key === " " || e.key === "Spacebar") {
      state.isFiring = down;
      e.preventDefault();
      return;
    }
    switch (e.key) {
      case "ArrowLeft":
      case "Left":
        keys.left = down;
        e.preventDefault();
        break;
      case "ArrowRight":
      case "Right":
        keys.right = down;
        e.preventDefault();
        break;
      case "ArrowUp":
      case "Up":
        keys.up = down;
        e.preventDefault();
        break;
      case "ArrowDown":
      case "Down":
        keys.down = down;
        e.preventDefault();
        break;
    }
  }
  window.addEventListener("keydown", (e) => handleKey(e, true));
  window.addEventListener("keyup", (e) => handleKey(e, false));

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
    enemies.length = 0;
    pBullets.length = 0;
    eBullets.length = 0;
    particles.length = 0;
    player.x = cw * 0.5;
    player.y = ch * 0.75;
    player.fireCooldown = 0;
    player.invUntil = 0;
    pointer.x = player.x;
    pointer.y = player.y;
    // Setup wingmen formation around player
    wingmen.length = 0;
    for (let i = 0; i < WINGMAN_OFFSETS.length; i++) {
      const off = WINGMAN_OFFSETS[i];
      wingmen.push({ x: player.x + off.x, y: player.y + off.y });
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
    finalScoreEl.textContent = state.score.toString();
    gameoverEl.classList.remove("hidden");
  }

  startBtn?.addEventListener("click", () => {
    startGame();
  });
  restartBtn?.addEventListener("click", () => {
    startGame();
  });

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
  overlay?.addEventListener("click", tryStartFromUI);
  overlay?.addEventListener("pointerdown", tryStartFromUI);
  window.addEventListener("keydown", (e) => {
    if (state.running) return;
    if (e.code === "Enter" || e.code === "Space" || e.key === " " || e.key === "Spacebar") {
      tryStartFromUI(e);
    }
  });

  // Spawning
  function spawnEnemy() {
    const d = getDifficulty();
    const size = rand(22, 34);
    const x = rand(size, cw - size);
    const vy = rand(60, 120) * (0.8 + d * 0.4);
    const hp = Math.random() < 0.2 * d ? 2 : 1;
    enemies.push({
      x,
      y: -size - 10,
      w: size,
      h: size * 1.1,
      r: size * 0.55,
      vy,
      t: Math.random() * Math.PI * 2, // phase for lateral motion
      amp: rand(20, 60) * (0.7 + d * 0.2),
      fireCd: rand(0.6, 1.8) / Math.sqrt(0.6 + d),
      fireTimer: rand(0.1, 0.6),
      hp,
    });
  }

  // Shooting
  function shootFrom(sx, sy, sh = player) {
    const speed = 700;
    pBullets.push({ x: sx - 6, y: sy - sh.h * 0.5, vx: 0, vy: -speed, r: 3.2 });
    pBullets.push({ x: sx + 6, y: sy - sh.h * 0.5, vx: 0, vy: -speed, r: 3.2 });
  }
  function shootPlayer() {
    shootFrom(player.x, player.y, player);
  }

  function shootEnemy(ex, ey) {
    // aim at player with some slight spread
    const d = Math.atan2(player.y - ey, player.x - ex) + rand(-0.06, 0.06);
    const spd = 280 + getDifficulty() * 90;
    const vx = Math.cos(d) * spd;
    const vy = Math.sin(d) * spd;
    eBullets.push({ x: ex, y: ey, vx, vy, r: 3.5 });
  }

  // Explosions / Particles
  function spawnExplosion(x, y, count = 30, kind = "enemy") {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = rand(60, kind === "player" ? 420 : 300);
      const vx = Math.cos(ang) * spd;
      const vy = Math.sin(ang) * spd;
      const life = rand(0.4, kind === "player" ? 1.2 : 0.8);
      const size = rand(2, kind === "player" ? 5 : 4);
      const palette =
        kind === "player"
          ? ["#b7f7ff", "#2ee6ff", "#e9faff", "#ffffff"]
          : ["#ff8fb6", "#ff3b81", "#ffd1e2", "#ffffff"];
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

  // Update + Draw
  function update(dt) {
    state.t += dt;

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

    // Player movement: arrow keys OR smooth follow to pointer
    const margin = 16;
    if (!state.dead) {
    let kx, ky;
    if (joystick.active) {
      // Analog from on-screen joystick
      kx = joystick.dx;
      ky = joystick.dy;
    } else {
      // Keyboard arrows
      kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      ky = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    }

    if (kx !== 0 || ky !== 0) {
      const speed = 420; // px per second
      const len = Math.hypot(kx, ky) || 1;
      player.x += (kx / len) * speed * dt;
      player.y += (ky / len) * speed * dt;
      // Keep pointer in sync to prevent tug-of-war
      pointer.x = player.x;
      pointer.y = player.y;
    } else {
      // smooth follow mouse/touch pointer
      const lerp = 1 - Math.pow(0.0001, dt); // time-based smoothing
      player.x += (pointer.x - player.x) * lerp;
      player.y += (pointer.y - player.y) * lerp;
    }
    player.x = clamp(player.x, margin, cw - margin);
    player.y = clamp(player.y, margin + 56, ch - margin); // avoid top HUD overlap too much
    }

    // Wingmen follow formation
    for (let i = 0; i < wingmen.length; i++) {
      const wm = wingmen[i];
      const off = WINGMAN_OFFSETS[i % WINGMAN_OFFSETS.length];
      const tx = clamp(player.x + off.x, margin, cw - margin);
      const ty = clamp(player.y + off.y, margin + 56, ch - margin);
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
      player.fireCooldown = Math.max(0.07, baseInterval - getDifficulty() * 0.02);
    }
    }

    // Spawn enemies
    if (!state.dead) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy();
      const base = rand(0.4, 1.0);
      state.spawnTimer = Math.max(0.2, base / (0.7 + getDifficulty() * 0.6));
    }
    }

    // Update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.t += dt;
      e.y += e.vy * dt;
      e.x += Math.sin(e.t * 2.0) * e.amp * dt;

      // Fire
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        shootEnemy(e.x, e.y + e.h * 0.2);
        e.fireTimer = e.fireCd;
      }

      // Offscreen cleanup
      if (e.y - e.h > ch + 40 || e.x < -80 || e.x > cw + 80) {
        enemies.splice(i, 1);
      }
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
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -20 || b.y > ch + 20 || b.x < -20 || b.x > cw + 20) {
        eBullets.splice(i, 1);
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

    // Collisions: enemy bullets vs player
    for (let i = eBullets.length - 1; i >= 0; i--) {
      const b = eBullets[i];
      const rr = (player.r + b.r) * (player.r + b.r);
      if (!state.dead && dist2(player.x, player.y, b.x, b.y) <= rr) {
        eBullets.splice(i, 1);
        damagePlayer();
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

    // Enemy bullets
    ctx.fillStyle = "#ff3b81";
    for (let b of eBullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Enemies
    for (let e of enemies) {
      drawEnemy(e);
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
    g.addColorStop(0, "rgba(255,59,129,0.25)");
    g.addColorStop(1, "rgba(255,59,129,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 10, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillStyle = "#ff8fb6";
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
    ctx.fillStyle = "#ff3b81";
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.2, w * 0.18, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

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

    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // Kick off in menu state
  overlay.classList.remove("hidden");
})();
