/* Chiến Tranh Ngân Hà - Move with mouse or arrows, hold Space to shoot
   Canvas arcade shooter - Vanilla JS
*/
(() => {
  "use strict";

  // Early declarations to avoid TDZ before resize() calls updateScale
  var scale = 1;
  const BASE_H = 900;
  const TIME_SCALE = 0.5; // Slow down game logic to half speed

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
      if (e.pointerType !== "touch") return;
      joy.active = true;
      joy.id = e.pointerId;
      updateJoyFromPointer(e);
      if (joystick.setPointerCapture) joystick.setPointerCapture(e.pointerId);
      e.preventDefault();
    }, { passive: false });
    joystick.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "touch" || !joy.active || e.pointerId !== joy.id) return;
      updateJoyFromPointer(e);
      e.preventDefault();
    }, { passive: false });
    const joyEnd = (e) => {
      if (e.pointerType !== "touch" || e.pointerId !== joy.id) return;
      resetJoy();
      if (joystick.releasePointerCapture) joystick.releasePointerCapture(e.pointerId);
      e.preventDefault();
    };
    joystick.addEventListener("pointerup", joyEnd, { passive: false });
    joystick.addEventListener("pointercancel", joyEnd, { passive: false });
  }

  window.addEventListener("blur", resetJoy);

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
    mgMultiplier: 2,
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

  // Remove on-screen joystick: no-op

  // Setup fire button to toggle continuous firing while pressed
  function fireDown(e) {
    if (e.pointerType !== "touch") return;
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
  });

  // Machine gun skill activation (Súng máy)
  function activateMG() {
    if (!state.running || state.dead) return;
    state.mgActive = true;
    state.mgTime = state.mgDuration;
    if (mgBtn) mgBtn.classList.add("active");
  }

  if (mgBtn) {
    mgBtn.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      activateMG();
      e.preventDefault();
    }, { passive: false });
  }


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
    state.totalToSpawn = 30; // Số địch của màn 1
    state.won = false;
    state.mgActive = false;
    state.mgTime = 0;
    if (mgBtn) mgBtn.classList.remove("active");
    enemies.length = 0;
    pBullets.length = 0;
    eBullets.length = 0;
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

if (startBtn) startBtn.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "touch") return;
  startGame();
  e.preventDefault();
}, { passive: false });
if (restartBtn) restartBtn.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "touch") return;
  startGame();
  e.preventDefault();
}, { passive: false });

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
  }

  // Spawning
  function spawnEnemy() {
    // Dừng sinh thêm nếu trùm đã xuất hiện
    if (state.bossSpawned || boss) return;

    const d = getDifficulty();
    const size = gs(rand(22, 34));
    const x = rand(size, cw - size);
    const vy = gs(rand(60, 120)) * (0.8 + d * 0.4);
    const hp = Math.random() < 0.2 * d ? 2 : 1;
    enemies.push({
      x,
      y: -size - gs(10),
      w: size,
      h: size * 1.1,
      r: size * 0.55,
      vy,
      t: Math.random() * Math.PI * 2, // phase for lateral motion
      amp: gs(rand(20, 60)) * (0.7 + d * 0.2),
      fireCd: rand(0.6, 1.8) / Math.sqrt(0.6 + d),
      fireTimer: rand(0.1, 0.6),
      hp,
    });

    state.enemiesSpawned += 1;
  }

  // Shooting
  function shootFrom(sx, sy, sh = player) {
    const speed = gs(700);
    pBullets.push({ x: sx - gs(6), y: sy - sh.h * 0.5, vx: 0, vy: -speed, r: gs(3.2) });
    pBullets.push({ x: sx + gs(6), y: sy - sh.h * 0.5, vx: 0, vy: -speed, r: gs(3.2) });
  }
  function shootPlayer() {
    shootFrom(player.x, player.y, player);
  }

  function shootEnemy(ex, ey) {
    // aim at player with some slight spread
    const d = Math.atan2(player.y - ey, player.x - ex) + rand(-0.06, 0.06);
    const spd = gs(280 + getDifficulty() * 90);
    const vx = Math.cos(d) * spd;
    const vy = Math.sin(d) * spd;
    eBullets.push({ x: ex, y: ey, vx, vy, r: gs(3.5) });
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

    // Player movement via on-screen joystick
    const margin = gs(16);
    if (!state.dead) {
      if (joy.active) {
        const spd = gs(420);
        player.x += joy.x * spd * dt;
        player.y += joy.y * spd * dt;
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
      if (state.mgActive) interval = Math.max(0.035, interval / state.mgMultiplier);
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

    // Spawn enemies (tiếp tục cho đến khi gặp trùm)
    if (!state.dead && !boss && !state.bossSpawned) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      // Double enemy spawn
      spawnEnemy();
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

    // Update boss
    if (boss) {
      updateBoss(dt);
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
          b.charge -= dt;
          if (b.charge <= 0) {
            b.phase = "fire";
          }
        } else {
          // fire phase
          b.fire -= dt;
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
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.fuse -= dt;

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

    // Enemy bullets (normal, orbs, lasers)
    for (let b of eBullets) {
      if (b.type === "laser") {
        const beamW = b.phase === "fire" ? b.width : Math.max(2, b.width * 0.35);
        const grad = ctx.createLinearGradient(b.x, b.y, b.x, ch);
        grad.addColorStop(0, "rgba(255,59,129,0.9)");
        grad.addColorStop(1, "rgba(255,59,129,0.0)");
        ctx.save();
        ctx.globalAlpha = b.phase === "charge" ? 0.6 : 1.0;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.rect(b.x - beamW * 0.5, b.y, beamW, ch - b.y);
        ctx.fill();
        // bright core
        ctx.globalAlpha = b.phase === "charge" ? 0.35 : 0.9;
        ctx.fillStyle = "rgba(255,219,238,0.95)";
        ctx.fillRect(b.x - Math.max(1, beamW * 0.15), b.y, Math.max(2, beamW * 0.3), ch - b.y);
        ctx.restore();
      } else if (b.type === "orb") {
        const a = Math.max(0, b.fuse / b.maxFuse);
        const glowR = b.r + gs(14) * (0.5 + 0.5 * a);
        const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.25, b.x, b.y, glowR);
        g.addColorStop(0, "rgba(255,219,238,0.95)");
        g.addColorStop(1, "rgba(255,59,129,0.25)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, glowR, 0, Math.PI * 2);
        ctx.fill();
        // core
        ctx.fillStyle = "#ff3b81";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#ff3b81";
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

  // Boss logic
  function spawnBoss() {
    const entryY = Math.max(gs(150), getHudHeight() + gs(120));
    boss = {
      x: cw * 0.5,
      y: -gs(120),
      w: gs(140),
      h: gs(120),
      r: gs(60),
      hp: 120,
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
      boss.y += gs(120) * dt;
      if (boss.y >= boss.entryY) {
        boss.y = boss.entryY;
        boss.entering = false;
      }
    } else {
      const tx = cw * 0.5 + Math.sin(boss.t * 0.7) * gs(180);
      const lerp = 1 - Math.pow(0.0001, dt);
      boss.x += (tx - boss.x) * lerp;
    }
    // Orbs
    boss.orbTimer -= dt;
    if (boss.orbTimer <= 0) {
      const d = Math.atan2(player.y - boss.y, player.x - boss.x) + rand(-0.05, 0.05);
      const spd = gs(160);
      const vx = Math.cos(d) * spd;
      const vy = Math.sin(d) * spd;
      const r = gs(12);
      const fuse = 1.3;
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
    g.addColorStop(0, "rgba(255,59,129,0.28)");
    g.addColorStop(1, "rgba(255,59,129,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, b.r + 14, 0, Math.PI * 2);
    ctx.fill();

    // body
    const w = b.w, h = b.h;
    ctx.fillStyle = "#ff8fb6";
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.55);
    ctx.lineTo(-w * 0.6, -h * 0.05);
    ctx.lineTo(-w * 0.45, h * 0.55);
    ctx.lineTo(w * 0.45, h * 0.55);
    ctx.lineTo(w * 0.6, -h * 0.05);
    ctx.closePath();
    ctx.fill();

    // cockpit
    ctx.fillStyle = "#ff3b81";
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.15, w * 0.22, h * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();

    // turrets
    ctx.fillStyle = "#ffd1e2";
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
    ctx.fillStyle = "#ff3b81";
    const ratio = clamp(b.hp / 120, 0, 1);
    ctx.fillRect(bx, by, barW * ratio, barH);
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

    update(dt * TIME_SCALE);
    draw();
    requestAnimationFrame(loop);
  }

  // Kick off in menu state
  overlay.classList.remove("hidden");
})();
