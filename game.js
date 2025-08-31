/* Chiến Tranh Ngân Hà - Move with mouse or arrows, Space to launch missiles
   Canvas arcade shooter - Vanilla JS
*/
(() => {
  "use strict";

  // Early declarations to avoid TDZ before resize() calls updateScale
  var scale = 1;
  const BASE_H = 900;
  const BASE_W = 1600; // Base width for responsive content scaling (fit to screen)
  const TIME_SCALE = 1; // Base speed (no global slow); temporary slow-mo handled via time-vibe
  // Tuning multipliers/divisors
  // - FIRE_RATE_MULTIPLIER: tăng tốc độ bắn của người chơi lên gấp 5 lần (giảm thời gian hồi)
  // - ENEMY_SPEED_DIVISOR: giảm tốc độ di chuyển của quân địch (bao gồm Boss) xuống 1/5
  // - ENEMY_BULLET_SPEED_DIVISOR: giảm tốc độ đạn của địch xuống 1/5
  const FIRE_RATE_MULTIPLIER = 5;
  const ENEMY_SPEED_DIVISOR = 5;
  const ENEMY_BULLET_SPEED_DIVISOR = 5;
const LASER_SKILL_DPS = 1000000; // DPS for drone-created laser rings

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
  const hpText = document.getElementById("hpText");
  const finalScoreEl = document.getElementById("finalScore");
  const coinsEl = document.getElementById("coins");
  const gainCoinsEl = document.getElementById("gainCoins");
  const baseOverlay = document.getElementById("base");
  const upHPBtn = document.getElementById("upHP");
  const upDEFBtn = document.getElementById("upDEF");
  const upDMGBtn = document.getElementById("upDMG");
  const upDiscBtn = document.getElementById("upDisc");
  const upSPDBtn = document.getElementById("upSPD");
  const upEXPBtn = document.getElementById("upEXP");
  const upCOLBtn = document.getElementById("upCOL");
  const toModeSelectBtn = document.getElementById("toModeSelect");
  const baseBackBtn = document.getElementById("baseBack");
  const baseBtn = document.getElementById("baseBtn");
  const backToMenuBtn = document.getElementById("backToMenuBtn");
// Pause UI
const pauseBtn = document.getElementById("pauseBtn");
const pauseMenu = document.getElementById("pauseMenu");
const resumeBtn = document.getElementById("resumeBtn");
const exitBtn = document.getElementById("exitBtn");

// Wire pause UI events (functions are hoisted)
if (pauseBtn) pauseBtn.addEventListener("click", (e) => { if (state.running && !state.paused) pauseGame(); });
if (resumeBtn) resumeBtn.addEventListener("click", (e) => { resumeGame(); });
if (exitBtn) exitBtn.addEventListener("click", (e) => { exitMatch(); });

  // Mode selection overlay
  const modeSelect = document.getElementById("modeSelect");
  const modeNormalBtn = document.getElementById("modeNormal");
  const modeHardBtn = document.getElementById("modeHard");
  const modeBossBtn = document.getElementById("modeBoss");
  const modeBackBtn = document.getElementById("modeBack");

  // On-screen controls
const fireBtn = document.getElementById("fireBtn");
const mgBtn = document.getElementById("mgBtn");
const missileBtn = document.getElementById("missileBtn");
const discipleBtn = document.getElementById("discipleBtn");
const joystick = document.getElementById("joystick");
const joyKnob = joystick ? joystick.querySelector(".joy-stick") : null;

const DEFAULT_MG_LABEL = "⏳";
const DEFAULT_MISSILE_LABEL = "🚀";
const DEFAULT_DISCIPLE_LABEL = "⚡️";

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
  // Keyboard state for desktop controls (WASD/Arrows to move)
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
  // Bình phương khoảng cách từ điểm (px,py) đến đoạn thẳng AB
  function pointSegDist2(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const wx = px - ax, wy = py - ay;
    const vv = vx * vx + vy * vy || 1e-6;
    let t = (wx * vx + wy * vy) / vv;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * vx;
    const cy = ay + t * vy;
    const dx = px - cx, dy = py - cy;
    return dx * dx + dy * dy;
  }

  // Responsive scale helpers
  // BASE_H and scale declared above to avoid TDZ in resize()
  const gs = (v) => v * scale; // scale numeric to current screen
  // Kích thước đạn theo sát thương (tăng nhẹ theo DMG để thấy khác biệt rõ ràng)
  function bulletRadiusByDmg(dmg) {
    const d = Math.max(0, Math.min(6, dmg || 0));
    return gs(2.8 + d * 0.25);
  }
  function updateScale() {
    // Fit content scale to screen using both dimensions to keep proportions consistent
    const sH = ch / BASE_H;
    const sW = cw / BASE_W;
    scale = clamp(Math.min(sW, sH), 0.6, 2.0);
    // Expose scale to CSS so HUD/controls can scale accordingly
    if (document && document.documentElement && document.documentElement.style) {
      document.documentElement.style.setProperty("--ui-scale", String(scale));
    }
  }
  function getHudHeight() {
    const hud = document.querySelector(".hud");
    return hud ? hud.offsetHeight : 56;
  }

  // Toggle menu mode (ẩn HUD/controls, nền đen thui ở menu chính)
  function setMenuActive(on) {
    document.body.classList.toggle("menu-active", !!on);
  }

  // Game state
  const MAX_LIVES = 100;
  const state = {
    mode: "normal",
    running: false,
    paused: false,
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
    mgCooldown: 0,
    missileCooldown: 0,
    discipleCooldown: 0,
    shieldActive: false,
    shieldTimer: 0,
    coins: 200,
    hpBonus: 0,
    maxLives: MAX_LIVES,
    defense: 0,
    dmgLevel: 0,
    discipleCount: 0,
    discipleSpeedLevel: 3,
    moveSpeedMul: 1,
    expLevel: 0,
    collectLevel: 0,
  };

  // Mode tuning (defaults)
  state.tuning = {
    enemySpeedMul: 1,
    enemyBulletSpeedMul: 1,
    spawnRateMul: 1,
    enemyFireRateMul: 1,
    enemyAmpMul: 1,
    playerLives: MAX_LIVES,
    miniBossChance: 0.06,
    starColor: "#a8f0ff",
  };

  function applyModeTuning() {
    const tuning = {
      enemySpeedMul: 1,
      enemyBulletSpeedMul: 1,
      spawnRateMul: 1,
      enemyFireRateMul: 1,
      enemyAmpMul: 1,
      playerLives: MAX_LIVES,
      miniBossChance: 0.06,
      starColor: "#a8f0ff",
    };
    switch (state.mode) {
      case "hard":
        tuning.enemySpeedMul = 1.6;
        tuning.enemyBulletSpeedMul = 1.6;
        tuning.spawnRateMul = 1.5;
        tuning.enemyFireRateMul = 1.3;
        tuning.playerLives = 70;
        break;
      case "boss":
        tuning.playerLives = MAX_LIVES;
        break;
      default:
        break;
    }
    state.tuning = tuning;
    starColor = tuning.starColor || "#a8f0ff";
  }

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

  function rebuildWingmen() {
    wingmen.length = 0;
    const n = Math.min(state.discipleCount || 0, WINGMAN_OFFSETS.length);
    for (let i = 0; i < n; i++) {
      const off = WINGMAN_OFFSETS[i];
      wingmen.push({ x: player.x + off.x * scale, y: player.y + off.y * scale });
    }
  }

  // Entities
  const pBullets = []; // player's bullets
  const eBullets = []; // enemy bullets
  const enemies = [];
  const missiles = []; // homing missiles
  const allyLasers = []; // friendly laser beams (disciple)
  const dBullets = []; // drone bullets
  const drones = []; // drone entities
  const particles = []; // explosion particles
  const dmgTexts = []; // floating damage numbers
  const turrets = []; // boss side turrets (machine gun)
  let boss = null; // Boss entity when present

  // Stars background
  let stars = [];
  let starColor = "#a8f0ff";
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
    // Tính Max HP động theo nâng cấp, ngay cả khi chưa vào trận
    const baseLives = (state.tuning && state.tuning.playerLives) ? state.tuning.playerLives : MAX_LIVES;
    const maxL = (state.running && state.maxLives) ? state.maxLives : baseLives + (state.hpBonus || 0);
    const ratio = clamp(state.lives / maxL, 0, 1);
    if (hpFill) hpFill.style.width = Math.round(ratio * 100) + "%";
    if (hpBar) {
      hpBar.setAttribute("aria-valuenow", String(state.lives));
      hpBar.setAttribute("aria-valuemax", String(maxL));
    }
    if (typeof hpText !== "undefined" && hpText) {
      hpText.textContent = `${Math.max(0, Math.floor(state.lives))}/${maxL}`;
    }
  }

  function updateCoinsUI() {
    if (coinsEl) coinsEl.textContent = String(state.coins || 0);
  }
  function refreshUpgradeUI() {
    if (upSPDBtn) upSPDBtn.textContent = "Nâng cấp tốc độ (10 xu)";
    if (upHPBtn) upHPBtn.textContent = "Nâng cấp máu (3 xu)";
    if (upCOLBtn) upCOLBtn.textContent = "Nâng cấp thu gom (30 xu)";
    if (upEXPBtn) upEXPBtn.textContent = "Nâng cấp kinh nghiệm (15 xu)";
    if (upDiscBtn) upDiscBtn.textContent = "Nâng cấp đệ tử (50 xu)";
    if (upDEFBtn) upDEFBtn.textContent = "Nâng cấp phòng thủ (5 xu)";
  }
  function awardCoins() {
    let gain = 0;
    if (state.mode === "normal") gain = 20;
    else if (state.mode === "hard") gain = 50;
    else if (state.mode === "boss") gain = 100;
    const mul = 1 + 0.1 * (state.collectLevel || 0);
    gain = Math.round(gain * mul);
    state.coins = (state.coins || 0) + gain;
    if (gainCoinsEl) gainCoinsEl.textContent = String(gain);
    updateCoinsUI();
  }

  // Input


  window.addEventListener("blur", () => {
    state.isFiring = false;
  });
  window.addEventListener("contextmenu", (e) => e.preventDefault());

  // Desktop mouse controls on canvas: move with mouse, hold to fire
  
  
  
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
    state.mgCooldown = 10;
    updateCooldownUI();
    updateUltButtonsVisibility();
  }
  function activateTimeVibe(duration = 5, factor = 0.5) {
    if (!state.running || state.dead || state.paused) return;
    if (state.timeVibeActive || state.mgCooldown > 0) return;
    // Chỉ cho phép một kỹ năng tối thượng hoạt động tại một thời điểm
    if (state.missileActive) deactivateMissiles();
    state.timeVibeActive = true;
    state.timeVibeRemaining = duration;
    state.timeVibeFactor = factor;
    if (mgBtn) mgBtn.classList.add("active");
    updateUltButtonsVisibility();
  }

  // Kích hoạt "tên lửa truy đuổi" (bắn tên lửa tự tìm mục tiêu trong 10 giây)
  function deactivateMissiles() {
    state.missileActive = false;
    state.missileTime = 0;
    if (missileBtn) missileBtn.classList.remove("active");
    state.missileCooldown = 5;
    updateCooldownUI();
    updateUltButtonsVisibility();
  }
  function activateMissiles() {
    if (!state.running || state.dead || state.paused) return;
    if (state.missileActive || state.missileCooldown > 0) return;
    // Chỉ cho phép một kỹ năng tối thượng hoạt động tại một thời điểm
    if (state.timeVibeActive) deactivateTimeVibe();
    state.missileActive = true;
    state.missileTime = state.missileDuration;
    state.missileCd = 0;
    if (missileBtn) missileBtn.classList.add("active");
    updateUltButtonsVisibility();
  }

  function updateUltButtonsVisibility() {
    // Khi kích hoạt kỹ năng, chỉ hiện nút của kỹ năng đang hoạt động; khi không kích hoạt, hiện cả hai
    if (missileBtn) missileBtn.style.display = (state.missileActive || (!state.missileActive && !state.timeVibeActive)) ? "" : "none";
    if (mgBtn) mgBtn.style.display = (state.timeVibeActive || (!state.missileActive && !state.timeVibeActive)) ? "" : "none";
  }

  // Drone Skill: spawn 1 drone orbiting 5s, then shoot 5s (cooldown handled by state.discipleCooldown)
  function activateDrone() {
    if (!state.running || state.dead || state.paused) return;
    if (state.discipleCooldown > 0) return;
    const r = gs(70);
    const ang = -Math.PI * 0.5;
    drones.push({
      phase: "orbit",
      timer: 5,
      ang,
      angVel: 2.4,
      r,
      x: player.x + Math.cos(ang) * r,
      y: player.y + Math.sin(ang) * r,
      shootInterval: 0.2,
      fireCd: 0
    });
    state.discipleCooldown = 5;
    if (discipleBtn) discipleBtn.classList.add("active");
  }

  // Shield Ring activation: 10s invulnerability with player-centered ring
  function activateShieldRing() {
    if (!state.running || state.dead || state.paused) return;
    if (state.shieldActive || state.discipleCooldown > 0) return;
    state.shieldActive = true;
    state.shieldTimer = 5;
    allyLasers.push({ type: "ring", r: gs(70), angle: 0, fire: 5, phase: "fire", hitTh: gs(18), shield: true });
    state.discipleCooldown = 10;
    if (discipleBtn) discipleBtn.classList.add("active");
  }

  // Cập nhật hiển thị đếm ngược hồi chiêu trên nút
  function updateCooldownUI() {
    if (mgBtn) {
      if (state.timeVibeActive) {
        mgBtn.textContent = DEFAULT_MG_LABEL;
        mgBtn.disabled = false;
        mgBtn.setAttribute("aria-label", "Ngưng động thời gian (Phím 2)");
        mgBtn.title = "Ngưng động thời gian (Phím 2)";
      } else if (state.mgCooldown > 0) {
        const s = Math.max(1, Math.ceil(state.mgCooldown));
        mgBtn.textContent = String(s);
        mgBtn.disabled = true;
        mgBtn.setAttribute("aria-label", `Ngưng động thời gian (hồi ${s}s)`);
        mgBtn.title = `Ngưng động thời gian (hồi ${s}s)`;
      } else {
        mgBtn.textContent = DEFAULT_MG_LABEL;
        mgBtn.disabled = false;
        mgBtn.setAttribute("aria-label", "Ngưng động thời gian (Phím 2)");
        mgBtn.title = "Ngưng động thời gian (Phím 2)";
      }
    }
    if (missileBtn) {
      if (state.missileActive) {
        missileBtn.textContent = DEFAULT_MISSILE_LABEL;
        missileBtn.disabled = false;
        missileBtn.setAttribute("aria-label", "Tên lửa truy đuổi (Space)");
        missileBtn.title = "Tên lửa truy đuổi (Space)";
      } else if (state.missileCooldown > 0) {
        const s2 = Math.max(1, Math.ceil(state.missileCooldown));
        missileBtn.textContent = String(s2);
        missileBtn.disabled = true;
        missileBtn.setAttribute("aria-label", `Tên lửa truy đuổi (hồi ${s2}s)`);
        missileBtn.title = `Tên lửa truy đuổi (hồi ${s2}s)`;
      } else {
        missileBtn.textContent = DEFAULT_MISSILE_LABEL;
        missileBtn.disabled = false;
        missileBtn.setAttribute("aria-label", "Tên lửa truy đuổi (Space)");
        missileBtn.title = "Tên lửa truy đuổi (Space)";
      }
    }
    if (discipleBtn) {
      if (state.discipleCooldown > 0) {
        const s3 = Math.max(1, Math.ceil(state.discipleCooldown));
        discipleBtn.textContent = String(s3);
        discipleBtn.disabled = true;
        discipleBtn.setAttribute("aria-label", `Đệ tử Laser (hồi ${s3}s)`);
        discipleBtn.title = `Đệ tử Laser (hồi ${s3}s)`;
      } else {
        discipleBtn.textContent = DEFAULT_DISCIPLE_LABEL;
        discipleBtn.disabled = false;
        discipleBtn.setAttribute("aria-label", "Đệ tử Laser (Phím 3)");
        discipleBtn.title = "Đệ tử Laser (Phím 3)";
      }
    }
  }

  if (mgBtn) {
    const onTime = (e) => {
      if (state.mgCooldown > 0 || state.timeVibeActive) { e.preventDefault(); return; }
      activateTimeVibe(5, 0.5);
      e.preventDefault();
    };
    mgBtn.addEventListener("pointerdown", onTime, { passive: false });
    mgBtn.addEventListener("click", onTime);
  }
  if (missileBtn) {
    const onMissile = (e) => {
      if (state.missileCooldown > 0 || state.missileActive) { e.preventDefault(); return; }
      activateMissiles();
      e.preventDefault();
    };
    missileBtn.addEventListener("pointerdown", onMissile, { passive: false });
    missileBtn.addEventListener("click", onMissile);
  }
  if (discipleBtn) {
    const onDisc = (e) => {
      if (state.discipleCooldown > 0) { e.preventDefault(); return; }
      activateDrone();
      e.preventDefault();
    };
    discipleBtn.addEventListener("pointerdown", onDisc, { passive: false });
    discipleBtn.addEventListener("click", onDisc);
  }

  // Keyboard controls (WASD/Arrows to move, Space to launch missiles)
  window.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "1": state.isFiring = true; e.preventDefault(); break;
      case "2": if (!state.timeVibeActive && state.mgCooldown <= 0) { activateTimeVibe(5, 0.5); } e.preventDefault(); break;
      case "ArrowLeft": case "a": case "A": keys.left = true; e.preventDefault(); break;
      case "ArrowRight": case "d": case "D": keys.right = true; e.preventDefault(); break;
      case "ArrowUp": case "w": case "W": keys.up = true; e.preventDefault(); break;
      case "ArrowDown": case "s": case "S": keys.down = true; e.preventDefault(); break;
      case " ": case "Spacebar": if (!state.missileActive && state.missileCooldown <= 0) { activateMissiles(); } e.preventDefault(); break;
      case "3": if (state.discipleCooldown <= 0) { activateDrone(); } e.preventDefault(); break;
    }
  });
  window.addEventListener("keyup", (e) => {
    switch (e.key) {
      case "1": state.isFiring = heldFirePointers.size > 0; break;
      case "ArrowLeft": case "a": case "A": keys.left = false; break;
      case "ArrowRight": case "d": case "D": keys.right = false; break;
      case "ArrowUp": case "w": case "W": keys.up = false; break;
      case "ArrowDown": case "s": case "S": keys.down = false; break;
    }
  });


   // Game control
  // Pause/Resume
  function pauseGame() {
    if (!state.running || state.dead || state.paused) return;
    state.paused = true;
    if (pauseMenu) pauseMenu.classList.remove("hidden");
  }
  function resumeGame() {
    if (!state.running || state.dead || !state.paused) return;
    state.paused = false;
    if (pauseMenu) pauseMenu.classList.add("hidden");
    state.lastTs = 0;
    requestAnimationFrame(loop);
  }
  function exitMatch() {
    state.paused = false;
    state.running = false;
    if (pauseMenu) pauseMenu.classList.add("hidden");
    backToMenu();
  }

  function resetGame() {
    state.score = 0;
    const baseLives = (state.tuning && state.tuning.playerLives) ? state.tuning.playerLives : MAX_LIVES;
    state.maxLives = baseLives + (state.hpBonus || 0);
    state.lives = state.maxLives;
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
    if (discipleBtn) discipleBtn.classList.remove("active");
    state.mgCooldown = 0;
    state.mgCooldown = 0;
    state.missileCooldown = 0;
    state.discipleCooldown = 0;
    state.shieldActive = false;
    state.shieldTimer = 0;
    updateUltButtonsVisibility();
    updateCooldownUI();
    enemies.length = 0;
    pBullets.length = 0;
    eBullets.length = 0;
    missiles.length = 0;
    allyLasers.length = 0;
    dBullets.length = 0;
    drones.length = 0;
    particles.length = 0;
    turrets.length = 0;
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
    // Setup wingmen formation around player (disciples)
    rebuildWingmen();
    initStars();
    updateHUD();
  }

  function startGame() {
    applyModeTuning();
    resetGame();
    state.running = true;
    setMenuActive(false);
    if (pauseMenu) pauseMenu.classList.add("hidden");
    if (overlay) overlay.classList.add("hidden");
    if (gameoverEl) gameoverEl.classList.add("hidden");
    if (modeSelect) modeSelect.classList.add("hidden");
    // Special Boss mode: spawn boss immediately with 1000 HP and 3 attack patterns (no laser)
    if (state.mode === "boss") {
      spawnBoss({ hp: 1000, mode: "boss" });
    }
    requestAnimationFrame(loop);
  }

  function gameOver() {
    state.running = false;
    state.isFiring = false;
    finalScoreEl.textContent = state.score.toString();
    awardCoins();
    const h1 = gameoverEl ? gameoverEl.querySelector("h1") : null;
    if (h1) h1.textContent = "Thua cuộc!";
    gameoverEl.classList.remove("hidden");
  }

  // Hiển thị chiến thắng: quay về trạng thái ban đầu (menu chính)
  function winGame() {
    state.won = true;
    // Dừng game, cộng xu, rồi quay về menu ban đầu như lúc chưa chơi
    state.running = false;
    state.isFiring = false;
    awardCoins();
    backToMenu();
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

  // Base overlay + Mode selection wiring
  function showBase() {
    if (overlay) overlay.classList.add("hidden");
    if (gameoverEl) gameoverEl.classList.add("hidden");
    if (modeSelect) modeSelect.classList.add("hidden");
    if (baseOverlay) baseOverlay.classList.remove("hidden");
    setMenuActive(true);
    updateCoinsUI();
    refreshUpgradeUI();
  }
  function showModeSelect() {
    if (overlay) overlay.classList.add("hidden");
    if (gameoverEl) gameoverEl.classList.add("hidden");
    if (baseOverlay) baseOverlay.classList.add("hidden");
    if (modeSelect) modeSelect.classList.remove("hidden");
    setMenuActive(true);
  }
  function selectMode(mode) {
    state.mode = mode;
    if (modeSelect) modeSelect.classList.add("hidden");
    startGame();
  }

  // Base buttons
  if (toModeSelectBtn) toModeSelectBtn.addEventListener("click", showModeSelect);
  if (baseBackBtn) baseBackBtn.addEventListener("click", () => {
    if (baseOverlay) baseOverlay.classList.add("hidden");
    if (overlay) overlay.classList.remove("hidden");
    setMenuActive(true);
  });

  // Back to initial menu
  function backToMenu() {
    resetGame();
    state.running = false;
    state.paused = false;
    if (pauseMenu) pauseMenu.classList.add("hidden");
    if (modeSelect) modeSelect.classList.add("hidden");
    if (gameoverEl) gameoverEl.classList.add("hidden");
    if (baseOverlay) baseOverlay.classList.add("hidden");
    if (overlay) overlay.classList.remove("hidden");
    setMenuActive(true);
  }
  if (backToMenuBtn) backToMenuBtn.addEventListener("click", backToMenu);

  // Main menu "Căn Cứ & Nâng Cấp"
  if (baseBtn) baseBtn.addEventListener("click", () => {
    if (!state.running) showBase();
  });

  // Upgrade buttons and spending
  function trySpendXu(cost) {
    if ((state.coins || 0) < cost) return false;
    state.coins -= cost;
    updateCoinsUI();
    return true;
  }
  // Backwards compat if any leftover calls
  function trySpend(cost) { return trySpendXu(cost); }
  if (upHPBtn) upHPBtn.addEventListener("click", () => {
    if (!trySpendXu(3)) return;
    state.hpBonus = (state.hpBonus || 0) + 1;
    // Cộng trực tiếp +1 máu hiện tại để thấy hiệu quả ngay lập tức
    const baseLives = (state.tuning && state.tuning.playerLives) ? state.tuning.playerLives : MAX_LIVES;
    const newMax = baseLives + (state.hpBonus || 0);
    state.lives = Math.min(newMax, (state.lives || 0) + 1);
    refreshUpgradeUI();
    updateHUD();
  });
  if (upDEFBtn) upDEFBtn.addEventListener("click", () => {
    if (!trySpendXu(5)) return;
    state.defense = (state.defense || 0) + 1;
    refreshUpgradeUI();
    updateHUD();
  });
  if (upDMGBtn) upDMGBtn.addEventListener("click", () => {
    if (!trySpend(5)) return;
    state.dmgLevel = (state.dmgLevel || 0) + 1;
    refreshUpgradeUI();
    updateHUD();
  });
  if (upDiscBtn) upDiscBtn.addEventListener("click", () => {
    if (!trySpendXu(50)) return;
    state.discipleCount = (state.discipleCount || 0) + 1;
    rebuildWingmen();
    refreshUpgradeUI();
    updateHUD();
  });
  if (upSPDBtn) upSPDBtn.addEventListener("click", () => {
    if (!trySpendXu(10)) return;
    state.moveSpeedMul = (state.moveSpeedMul || 1) + 0.1;
    refreshUpgradeUI();
    updateHUD();
  });
  if (upEXPBtn) upEXPBtn.addEventListener("click", () => {
    if (!trySpendXu(15)) return;
    state.expLevel = (state.expLevel || 0) + 1;
    refreshUpgradeUI();
    updateHUD();
  });
  if (upCOLBtn) upCOLBtn.addEventListener("click", () => {
    if (!trySpendXu(30)) return;
    state.collectLevel = (state.collectLevel || 0) + 1;
    refreshUpgradeUI();
    updateHUD();
  });

  // Mode buttons (no Forest)
  if (modeNormalBtn) modeNormalBtn.addEventListener("click", () => selectMode("normal"));
  if (modeHardBtn) modeHardBtn.addEventListener("click", () => selectMode("hard"));
  if (modeBossBtn) modeBossBtn.addEventListener("click", () => selectMode("boss"));
  if (modeBackBtn) modeBackBtn.addEventListener("click", () => {
    if (modeSelect) modeSelect.classList.add("hidden");
    if (overlay) overlay.classList.remove("hidden");
  });

  // Extra start triggers for robustness: click anywhere on overlay, or press Enter/Space
  function tryStartFromUI(e) {
    if (state.running) return;
    const startVisible = overlay && !overlay.classList.contains("hidden");
    const gameoverVisible = gameoverEl && !gameoverEl.classList.contains("hidden");
    if (startVisible || gameoverVisible) {
      showModeSelect();
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

    // Tỉ lệ nhỏ sinh "trùm nhỏ" (mini-boss) sau khi đã có vài đợt
    if (state.enemiesSpawned > 20 && Math.random() < (state.tuning.miniBossChance || 0.06)) {
      spawnMiniBoss();
      state.enemiesSpawned += 1;
      return;
    }

    const d = getDifficulty();
    const size = gs(rand(22, 34));
    const x = rand(size, cw - size);
    const vy = ((gs(rand(60, 120)) * (0.8 + d * 0.4)) / ENEMY_SPEED_DIVISOR) * (state.tuning.enemySpeedMul || 1);
    const hp = Math.random() < 0.2 * d ? 2 : 1;
    enemies.push({
      x,
      y: -size - gs(10),
      w: size,
      h: size * 1.1,
      r: size * 0.55,
      vy,
      t: Math.random() * Math.PI * 2, // phase for lateral motion
      amp: ((gs(rand(20, 60)) * (0.7 + d * 0.2)) / ENEMY_SPEED_DIVISOR) * (state.tuning.enemyAmpMul || 1),
      fireCd: (rand(0.6, 1.8) / Math.sqrt(0.6 + d)) / (state.tuning.enemyFireRateMul || 1),
      fireTimer: rand(0.1, 0.6),
      hp,
    });

    state.enemiesSpawned += 1;
  }

  // Mini-boss: bắn súng máy và bắn loạt cầu năng lượng nhanh
  function spawnMiniBoss() {
    const size = gs(rand(70, 90));
    const x = cw * 0.5;
    const vy = (gs(40) / ENEMY_SPEED_DIVISOR) * (state.tuning.enemySpeedMul || 1);
    const hp = 60;
    enemies.push({
      type: "miniBoss",
      x,
      y: -size - gs(20),
      w: size,
      h: size * 1.1,
      r: size * 0.55,
      vy,
      t: 0,
      amp: (gs(80) / ENEMY_SPEED_DIVISOR) * (state.tuning.enemyAmpMul || 1),
      entryY: Math.max(gs(140), getHudHeight() + gs(110)),
      entering: true,
      mgBurstTimer: rand(0.6, 1.2),
      mgShotTimer: 0,
      mgShotsRemaining: 0,
      mgShotInterval: 0.06 / (state.tuning.enemyFireRateMul || 1),
      orbBurstCd: rand(2.0, 3.2),
      hp
    });
  }

  function updateMiniBoss(e, dtEnemy) {
    e.t += dtEnemy;
    if (e.entering) {
      e.y += e.vy * dtEnemy;
      if (e.y >= e.entryY) {
        e.y = e.entryY;
        e.entering = false;
      }
    } else {
      const tx = cw * 0.5 + Math.sin(e.t * 0.9) * e.amp;
      const lerp = 1 - Math.pow(0.0001, dtEnemy);
      e.x += (tx - e.x) * lerp;
    }

    // Bắn súng máy theo đợt
    e.mgBurstTimer -= dtEnemy;
    if (e.mgBurstTimer <= 0 && e.mgShotsRemaining <= 0) {
      e.mgShotsRemaining = 18;
      e.mgShotTimer = 0;
      e.mgBurstTimer = rand(1.4, 2.2);
    }
    if (e.mgShotsRemaining > 0) {
      e.mgShotTimer -= dtEnemy;
      if (e.mgShotTimer <= 0) {
        const d = Math.atan2(player.y - (e.y + e.h * 0.2), player.x - e.x) + rand(-0.05, 0.05);
        const spd = gs(360) / ENEMY_BULLET_SPEED_DIVISOR;
        const vx = Math.cos(d) * spd;
        const vy = Math.sin(d) * spd;
        eBullets.push({ x: e.x, y: e.y + e.h * 0.2, vx, vy, r: gs(3.3) });
        e.mgShotsRemaining -= 1;
        e.mgShotTimer = e.mgShotInterval;
      }
    }

    // Bắn loạt "cầu năng lượng" nhanh, bay xa
    e.orbBurstCd -= dtEnemy;
    if (e.orbBurstCd <= 0) {
      const shots = 6;
      for (let i = 0; i < shots; i++) {
        const d = Math.atan2(player.y - (e.y + e.h * 0.25), player.x - e.x) + rand(-0.12, 0.12);
        const spd = (gs(300) / ENEMY_BULLET_SPEED_DIVISOR) * (state.tuning.enemyBulletSpeedMul || 1);
        const vx = Math.cos(d) * spd;
        const vy = Math.sin(d) * spd;
        const r = gs(8);
        const fuse = 2.6;
        const explodeR = gs(70);
        const minTravel = Math.min(cw, ch) * 0.45;
        const friction = 0.9985;
        eBullets.push({ type: "orb", x: e.x, y: e.y + e.h * 0.25, vx, vy, r, fuse, maxFuse: fuse, explodeR, minTravel, traveled: 0, friction });
      }
      e.orbBurstCd = rand(3.0, 4.2);
    }
  }

  // Shooting
  function shootFrom(sx, sy, sh = player, speed = gs(84), dmg = 1) {
    const r = bulletRadiusByDmg(dmg);
    pBullets.push({ x: sx - gs(6), y: sy - sh.h * 0.5, vx: 0, vy: -speed, r, dmg });
    pBullets.push({ x: sx + gs(6), y: sy - sh.h * 0.5, vx: 0, vy: -speed, r, dmg });
  }
  function shootPlayer() {
    const playerDmg = 1 + (state.dmgLevel || 0) * 3;
    shootFrom(player.x, player.y, player, gs(60), playerDmg);
  }

  function shootEnemy(ex, ey) {
    // twin-shot like player, aimed at player, enemy-colored bullets
    const d = Math.atan2(player.y - ey, player.x - ex) + rand(-0.06, 0.06);
    const spd = (gs(280 + getDifficulty() * 90) / ENEMY_BULLET_SPEED_DIVISOR) * (state.tuning.enemyBulletSpeedMul || 1);
    const vx = Math.cos(d) * spd;
    const vy = Math.sin(d) * spd;
    const off = gs(6);
    eBullets.push({ x: ex - off, y: ey, vx, vy, r: gs(3.5) });
    eBullets.push({ x: ex + off, y: ey, vx, vy, r: gs(3.5) });
  }

  // Spawn a homing missile (from any origin; defaults to player)
  function spawnMissile(sx = player.x, sy = player.y - player.h * 0.6) {
    const speed = gs(520);
    const turn = 6.0; // rad/s turn rate
    const r = gs(5);
    missiles.push({
      x: sx,
      y: sy,
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

  // Floating damage numbers
  function spawnDamageText(x, y, val, color = "#e9faff") {
    dmgTexts.push({ x, y, val, color, vy: -60, life: 0.7, max: 0.7 });
  }
  function updateDamageTexts(dt) {
    for (let i = dmgTexts.length - 1; i >= 0; i--) {
      const t = dmgTexts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= 0.98;
      if (t.life <= 0) dmgTexts.splice(i, 1);
    }
  }
  function drawDamageTexts() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.round(gs(16))}px system-ui, Arial`;
    for (let t of dmgTexts) {
      const a = Math.max(0, t.life / t.max);
      ctx.globalAlpha = Math.min(1, 0.2 + a);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillText(`-${t.val}`, t.x + 1.5, t.y + 1.5);
      ctx.globalAlpha = a;
      ctx.fillStyle = t.color || "#e9faff";
      ctx.fillText(`-${t.val}`, t.x, t.y);
    }
    ctx.restore();
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

  function drawDBullets() {
    for (let b of dBullets) {
      const g = ctx.createRadialGradient(b.x, b.y, Math.max(1, b.r * 0.25), b.x, b.y, b.r + gs(8));
      g.addColorStop(0, "rgba(219,234,254,1)");
      g.addColorStop(1, "rgba(59,130,246,0.35)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + gs(2), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDrones() {
    for (let d of drones) {
      ctx.save();
      ctx.translate(d.x, d.y);
      const g = ctx.createRadialGradient(0, 0, 3, 0, 0, 14);
      g.addColorStop(0, "rgba(46,230,255,0.3)");
      g.addColorStop(1, "rgba(46,230,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#c9fbff";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#8fe4ff";
      ctx.beginPath();
      ctx.arc(0, -2, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  function drawAllyLasers() {
    for (let L of allyLasers) {
      if (L.type === "auto") {
        const cx = player.x, cy = player.y;
        const w = L.width || gs(60);
        const len = L.len || Math.max(cw, ch) * 1.4;
        const alpha = L.phase === "charge" ? 0.75 : 1.0;
        const ang = L.angle || -Math.PI * 0.5;
        const bx = cx + Math.cos(ang) * len;
        const by = cy + Math.sin(ang) * len;

        ctx.save();
        // Glow
        ctx.globalAlpha = 0.6 * alpha;
        ctx.strokeStyle = "rgba(34,211,238,0.5)";
        ctx.lineWidth = w * 2.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(bx, by);
        ctx.stroke();

        // Core
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "#b7f7ff";
        ctx.lineWidth = w;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(bx, by);
        ctx.stroke();

        // Inner bright core
        ctx.globalAlpha = Math.min(1, 0.9 * alpha);
        ctx.strokeStyle = "#e9faff";
        ctx.lineWidth = Math.max(2, w * 0.35);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.restore();
      } else if (L.type === "spokes") {
        const cx = player.x, cy = player.y;
        const n = L.spokeCount || 8;
        const w = L.width || gs(18);
        const len = L.len || Math.max(cw, ch) * 1.1;
        const alpha = L.phase === "charge" ? 0.75 : 1.0;
        ctx.save();

        // Shield aura
        ctx.globalAlpha = 0.35 * alpha;
        const gAura = ctx.createRadialGradient(cx, cy, 8, cx, cy, gs(60));
        gAura.addColorStop(0, "rgba(46,230,255,0.35)");
        gAura.addColorStop(1, "rgba(46,230,255,0)");
        ctx.fillStyle = gAura;
        ctx.beginPath();
        ctx.arc(cx, cy, gs(60), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Spokes
        for (let k = 0; k < n; k++) {
          const ang = (L.angle || 0) + (k * Math.PI * 2) / n;
          const bx = cx + Math.cos(ang) * len;
          const by = cy + Math.sin(ang) * len;

          // Glow
          ctx.globalAlpha = 0.6 * alpha;
          ctx.strokeStyle = "rgba(34,211,238,0.5)";
          ctx.lineWidth = w * 2.6;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(bx, by);
          ctx.stroke();

          // Core
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = "#b7f7ff";
          ctx.lineWidth = w;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }

        ctx.restore();
      } else if (L.type === "ring") {
        const cx = (L.cx ?? player.x), cy = (L.cy ?? player.y);
        const r = L.r;
        ctx.save();

        // Outer glow ring (vòng phát sáng)
        const g = ctx.createRadialGradient(cx, cy, Math.max(1, r - gs(16)), cx, cy, r + gs(18));
        g.addColorStop(0, "rgba(34,211,238,0.0)");
        g.addColorStop(1, "rgba(34,211,238,0.35)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r + gs(18), 0, Math.PI * 2);
        ctx.arc(cx, cy, Math.max(1, r - gs(18)), 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.fill();

        // Ring stroke (vòng chính)
        ctx.globalAlpha = L.phase === "charge" ? 0.6 : 1.0;
        ctx.strokeStyle = "#b7f7ff";
        ctx.lineWidth = gs(10);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        // Rotating highlight (điểm sáng xoay)
        const ang = L.angle || 0;
        const hx = cx + Math.cos(ang) * r;
        const hy = cy + Math.sin(ang) * r;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#2ee6ff";
        ctx.beginPath();
        ctx.arc(hx, hy, gs(8), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      } else {
        // Legacy dọc (fallback nếu còn dữ liệu cũ)
        const beamW = L.phase === "fire" ? L.width : Math.max(2, L.width * 0.35);
        const grad = ctx.createLinearGradient(L.x, 0, L.x, ch);
        grad.addColorStop(0, "rgba(34,211,238,0.9)");
        grad.addColorStop(1, "rgba(34,211,238,0.0)");
        ctx.save();
        ctx.globalAlpha = L.phase === "charge" ? 0.6 : 1.0;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.rect(L.x - beamW * 0.5, 0, beamW, ch);
        ctx.fill();
        // bright core
        ctx.globalAlpha = L.phase === "charge" ? 0.35 : 0.9;
        ctx.fillStyle = "rgba(183,247,255,0.95)";
        ctx.fillRect(L.x - Math.max(1, beamW * 0.15), 0, Math.max(2, beamW * 0.3), ch);
        ctx.restore();
      }
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
      const spd = gs(420) * (state.moveSpeedMul || 1);
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
      const discSpeed = gs(60);
      const discDmg = 1 + (state.dmgLevel || 0);
      for (let wm of wingmen) {
        shootFrom(wm.x, wm.y, player, discSpeed, discDmg);
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
        // Player launches a missile
        spawnMissile();
        // Wingmen also launch missiles
        for (let wm of wingmen) {
          spawnMissile(wm.x, wm.y - player.h * 0.6);
        }
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
      state.spawnTimer /= (state.tuning.spawnRateMul || 1);
    }
    }

    // Update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.type === "miniBoss") {
        updateMiniBoss(e, dtEnemy);
      } else {
        e.t += dtEnemy;
        e.y += e.vy * dtEnemy;
        e.x += Math.sin(e.t * 2.0) * e.amp * dtEnemy;

        // Fire
        e.fireTimer -= dtEnemy;
        if (e.fireTimer <= 0) {
          shootEnemy(e.x, e.y + e.h * 0.2);
          e.fireTimer = e.fireCd;
        }
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
          if (!state.dead && !state.shieldActive) {
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

      // Energy orb with timed explosion (must fly far before exploding)
      if (b.type === "orb") {
        // slow drifting with configurable friction
        const fr = b.friction ?? 0.995;
        b.vx *= fr;
        b.vy *= fr;
        b.x += b.vx * dtEnemy;
        b.y += b.vy * dtEnemy;
        b.fuse -= dtEnemy;

        // accumulate traveled distance
        const spdNow = Math.hypot(b.vx, b.vy);
        b.traveled = (b.traveled || 0) + spdNow * dtEnemy;

        const off = (b.x < -30 || b.x > cw + 30 || b.y < -30 || b.y > ch + 30);
        const minTravel = b.minTravel || 0;

        // Only explode when it has flown far enough OR leaves screen
        if ((b.fuse <= 0 && b.traveled >= minTravel) || off) {
          // Explode here with AoE
          if (!state.dead && !state.shieldActive) {
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
          spawnDamageText(m.x, m.y, 3, "#FFD27F");
          if (e.hp <= 0) {
            explodeEnemy(e);
            enemies.splice(j, 1);
            state.score += (e.type === "miniBoss" ? 800 : 100);
            updateHUD();
          }
          spawnExplosion(m.x, m.y, 24, "enemy");
          missiles.splice(i, 1);
          hit = true;
          break;
        }
      }
      if (hit) continue;

      // Collide with turrets
      for (let j = turrets.length - 1; j >= 0; j--) {
        const t = turrets[j];
        const rrT = (t.r + m.r) * (t.r + m.r);
        if (dist2(m.x, m.y, t.x, t.y) <= rrT) {
          t.hp -= 5;
          spawnDamageText(m.x, m.y, 5, "#FFD27F");
          spawnExplosion(m.x, m.y, 30, "enemy");
          missiles.splice(i, 1);
          hit = true;
          if (t.hp <= 0) {
            spawnExplosion(t.x, t.y, 60, "enemy");
            turrets.splice(j, 1);
            state.score += 300;
            updateHUD();
          }
          break;
        }
      }
      if (hit) continue;

      // Collide with boss
      if (boss) {
        const rrB = (boss.r + m.r) * (boss.r + m.r);
        if (dist2(m.x, m.y, boss.x, boss.y) <= rrB) {
          boss.hp -= 8;
          spawnDamageText(m.x, m.y, 8, "#FFD27F");
          spawnExplosion(m.x, m.y, 35, "enemy");
          missiles.splice(i, 1);
          if (boss.hp <= 0) {
            spawnExplosion(boss.x, boss.y, 200, "enemy");
            boss = null;
            turrets.length = 0;
            state.score += 2000;
            updateHUD();
            if (!state.won) {
              winGame();
              return;
            }
          }
          continue;
        }
      }

      // Off-screen cleanup
      if (m.y < -40 || m.y > ch + 40 || m.x < -40 || m.x > cw + 40) {
        missiles.splice(i, 1);
      }
    }

    // Update drones (orbit then shoot)
  for (let i = drones.length - 1; i >= 0; i--) {
    const d = drones[i];
    const orbitR = d.r || gs(70);
    d.ang = (d.ang || -Math.PI * 0.5) + (d.angVel || 2.4) * dt;
    const cx = player.x, cy = player.y;
    d.x = cx + Math.cos(d.ang) * orbitR;
    d.y = cy + Math.sin(d.ang) * orbitR;

    d.timer -= dt;
    if (d.phase === "orbit") {
      if (d.timer <= 0) {
        d.phase = "shoot";
        d.timer = 5;
        d.fireCd = 0;
      }
    } else {
      d.fireCd = (d.fireCd || 0) - dt;
      if (d.fireCd <= 0) {
        // Drone fires a small laser ring (stationary) that lasts 2 seconds
        allyLasers.push({ type: "ring", r: gs(34), angle: 0, fire: 2, phase: "fire", hitTh: gs(10), cx: d.x, cy: d.y, dps: LASER_SKILL_DPS });
        d.fireCd = d.shootInterval || 0.2;
      }
      if (d.timer <= 0) {
        drones.splice(i, 1);
        continue;
      }
    }
  }

  // Update drone bullets
  for (let i = dBullets.length - 1; i >= 0; i--) {
    const b = dBullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y < -20 || b.y > ch + 20 || b.x < -20 || b.x > cw + 20) {
      dBullets.splice(i, 1);
      continue;
    }
    let hit = false;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const rr = (e.r + b.r) * (e.r + b.r);
      if (dist2(e.x, e.y, b.x, b.y) <= rr) {
        e.hp -= 1;
        spawnDamageText(b.x, b.y, 1, "#93c5fd");
        if (e.hp <= 0) {
          explodeEnemy(e);
          enemies.splice(j, 1);
          state.score += (e.type === "miniBoss" ? 800 : 100);
          updateHUD();
        }
        allyLasers.push({ type: "ring", r: gs(34), angle: 0, fire: 2, phase: "fire", hitTh: gs(10), cx: e.x, cy: e.y, dps: LASER_SKILL_DPS });
        dBullets.splice(i, 1);
        hit = true;
        break;
      }
    }
    if (hit) continue;

    for (let j = turrets.length - 1; j >= 0; j--) {
      const t = turrets[j];
      const rrT = (t.r + b.r) * (t.r + b.r);
      if (dist2(t.x, t.y, b.x, b.y) <= rrT) {
        t.hp -= 1;
        spawnDamageText(b.x, b.y, 1, "#93c5fd");
        if (t.hp <= 0) {
          spawnExplosion(t.x, t.y, 60, "enemy");
          turrets.splice(j, 1);
          state.score += 300;
          updateHUD();
        }
        allyLasers.push({ type: "ring", r: gs(34), angle: 0, fire: 2, phase: "fire", hitTh: gs(10), cx: t.x, cy: t.y, dps: LASER_SKILL_DPS });
        dBullets.splice(i, 1);
        hit = true;
        break;
      }
    }
    if (hit) continue;

    if (boss) {
      const rrB = (boss.r + b.r) * (boss.r + b.r);
      if (dist2(boss.x, boss.y, b.x, b.y) <= rrB) {
        boss.hp -= 1;
        spawnDamageText(b.x, b.y, 1, "#93c5fd");
        if (boss.hp <= 0) {
          spawnExplosion(boss.x, boss.y, 200, "enemy");
          boss = null;
          turrets.length = 0;
          state.score += 2000;
          updateHUD();
          if (!state.won) {
            winGame();
            return;
          }
        }
        allyLasers.push({ type: "ring", r: gs(34), angle: 0, fire: 2, phase: "fire", hitTh: gs(10), cx: b.x, cy: b.y, dps: LASER_SKILL_DPS });
        dBullets.splice(i, 1);
        continue;
      }
    }
  }

  // Update ally lasers (disciple)
    for (let i = allyLasers.length - 1; i >= 0; i--) {
      const L = allyLasers[i];
      if (L.phase === "charge") {
        L.charge -= dt;
        if (L.charge <= 0) {
          L.phase = "fire";
        }
        continue;
      }

      // Fire phase
      L.fire -= dt;

      if (L.type === "auto") {
        const cx = player.x, cy = player.y;
        const w = L.width || gs(60);
        const hw = w * 0.5;
        const len = L.len || Math.max(cw, ch) * 1.4;

        // Tính hướng có nhiều địch nhất bằng tổng vector có trọng số theo khoảng cách
        let sx = 0, sy = 0;
        const addVec = (tx, ty, weight = 1) => {
          const dx = tx - cx, dy = ty - cy;
          const d = Math.hypot(dx, dy) || 1e-6;
          const wgt = weight * (1 / (0.3 + d / gs(400))); // gần hơn => nặng hơn
          sx += (dx / d) * wgt;
          sy += (dy / d) * wgt;
        };
        for (let e of enemies) addVec(e.x, e.y, 1);
        for (let t of turrets) addVec(t.x, t.y, 1.2);
        if (boss) addVec(boss.x, boss.y, 2.0);

        let desired = (sx !== 0 || sy !== 0) ? Math.atan2(sy, sx) : (L.angle ?? -Math.PI * 0.5);
        const cur = L.angle ?? -Math.PI * 0.5;
        let diff = desired - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = (L.turn || 5.0) * dt;
        L.angle = cur + clamp(diff, -maxTurn, maxTurn);

        // Đầu mút tia
        const ang = L.angle;
        const bx = cx + Math.cos(ang) * len;
        const by = cy + Math.sin(ang) * len;

        // Xóa địch khi chạm tia
        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          const d2e = pointSegDist2(e.x, e.y, cx, cy, bx, by);
          if (d2e <= (hw + e.r) * (hw + e.r)) {
            explodeEnemy(e);
            enemies.splice(j, 1);
            state.score += (e.type === "miniBoss" ? 800 : 100);
            updateHUD();
          }
        }

        // Xóa đạn địch (trừ laser trùm)
        for (let j = eBullets.length - 1; j >= 0; j--) {
          const b = eBullets[j];
          if (b.type === "laser") continue;
          const br = b.r || gs(4);
          const d2b = pointSegDist2(b.x, b.y, cx, cy, bx, by);
          if (d2b <= (hw + br) * (hw + br)) {
            eBullets.splice(j, 1);
          }
        }

        // Gây sát thương cho ụ súng
        for (let j = turrets.length - 1; j >= 0; j--) {
          const t = turrets[j];
          const d2t = pointSegDist2(t.x, t.y, cx, cy, bx, by);
          if (d2t <= (hw + t.r) * (hw + t.r)) {
            t.hp -= 100 * dt;
            if (t.hp <= 0) {
              spawnExplosion(t.x, t.y, 60, "enemy");
              turrets.splice(j, 1);
              state.score += 300;
              updateHUD();
            }
          }
        }

        // Gây sát thương cho trùm
        if (boss) {
          const d2B = pointSegDist2(boss.x, boss.y, cx, cy, bx, by);
          if (d2B <= (hw + boss.r) * (hw + boss.r)) {
            boss.hp -= 500 * dt;
            if (boss.hp <= 0) {
              spawnExplosion(boss.x, boss.y, 200, "enemy");
              boss = null;
              turrets.length = 0;
              state.score += 2000;
              updateHUD();
              if (!state.won) {
                winGame();
                return;
              }
            }
          }
        }

      } else if (L.type === "spokes") {
        // Các tia thẳng xoay quanh người chơi
        L.angle = (L.angle || 0) + (L.angVel || 4.0) * dt;

        const cx = player.x, cy = player.y;
        const n = L.spokeCount || 8;
        const w = L.width || gs(18);
        const len = L.len || Math.max(cw, ch) * 1.1;
        const hw = w * 0.5;

        // Xóa địch khi chạm tia
        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          let hit = false;
          for (let k = 0; k < n; k++) {
            const ang = (L.angle || 0) + (k * Math.PI * 2) / n;
            const bx = cx + Math.cos(ang) * len;
            const by = cy + Math.sin(ang) * len;
            const d2 = pointSegDist2(e.x, e.y, cx, cy, bx, by);
            if (d2 <= (hw + e.r) * (hw + e.r)) {
              explodeEnemy(e);
              enemies.splice(j, 1);
              state.score += (e.type === "miniBoss" ? 800 : 100);
              updateHUD();
              hit = true;
              break;
            }
          }
          if (hit) continue;
        }

        // Xóa đạn địch (trừ laser trùm)
        for (let j = eBullets.length - 1; j >= 0; j--) {
          const b = eBullets[j];
          if (b.type === "laser") continue;
          let hit = false;
          for (let k = 0; k < n; k++) {
            const ang = (L.angle || 0) + (k * Math.PI * 2) / n;
            const bx = cx + Math.cos(ang) * len;
            const by = cy + Math.sin(ang) * len;
            const br = b.r || gs(4);
            const d2 = pointSegDist2(b.x, b.y, cx, cy, bx, by);
            if (d2 <= (hw + br) * (hw + br)) {
              eBullets.splice(j, 1);
              hit = true;
              break;
            }
          }
          if (hit) continue;
        }

        // Gây sát thương cho ụ súng
        for (let j = turrets.length - 1; j >= 0; j--) {
          const t = turrets[j];
          for (let k = 0; k < n; k++) {
            const ang = (L.angle || 0) + (k * Math.PI * 2) / n;
            const bx = cx + Math.cos(ang) * len;
            const by = cy + Math.sin(ang) * len;
            const d2 = pointSegDist2(t.x, t.y, cx, cy, bx, by);
            if (d2 <= (hw + t.r) * (hw + t.r)) {
              t.hp -= 60 * dt;
              break;
            }
          }
          if (t.hp <= 0) {
            spawnExplosion(t.x, t.y, 60, "enemy");
            turrets.splice(j, 1);
            state.score += 300;
            updateHUD();
          }
        }

        // Gây sát thương cho trùm nếu tia chạm
        if (boss) {
          let touching = false;
          for (let k = 0; k < n; k++) {
            const ang = (L.angle || 0) + (k * Math.PI * 2) / n;
            const bx = cx + Math.cos(ang) * len;
            const by = cy + Math.sin(ang) * len;
            const d2B = pointSegDist2(boss.x, boss.y, cx, cy, bx, by);
            if (d2B <= (hw + boss.r) * (hw + boss.r)) {
              touching = true;
              break;
            }
          }
          if (touching) {
            boss.hp -= 300 * dt;
            if (boss.hp <= 0) {
              spawnExplosion(boss.x, boss.y, 200, "enemy");
              boss = null;
              turrets.length = 0;
              state.score += 2000;
              updateHUD();
              if (!state.won) {
                winGame();
                return;
              }
            }
          }
        }

      } else if (L.type === "ring") {
        // Vòng tròn xoay quanh vị trí chỉ định (mặc định quanh người chơi)
        L.angle = (L.angle || 0) + (L.angVel || 4.0) * dt;

        const cx = (L.cx ?? player.x), cy = (L.cy ?? player.y);
        const r = L.r;
        const th = L.hitTh || gs(22);
        const rMin2 = Math.max(0, (r - th) * (r - th));
        const rMax2 = (r + th) * (r + th);

        // Xóa địch nằm trong băng vòng tròn
        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          const d2 = dist2(cx, cy, e.x, e.y);
          if (d2 >= rMin2 && d2 <= rMax2) {
            explodeEnemy(e);
            enemies.splice(j, 1);
            state.score += (e.type === "miniBoss" ? 800 : 100);
            updateHUD();
          }
        }

        // Xóa đạn địch (trừ laser) nằm trong băng vòng tròn
        for (let j = eBullets.length - 1; j >= 0; j--) {
          const b = eBullets[j];
          if (b.type === "laser") continue;
          const d2 = dist2(cx, cy, b.x, b.y);
          if (d2 >= rMin2 && d2 <= rMax2) {
            eBullets.splice(j, 1);
          }
        }

        // Gây sát thương cho ụ súng trong băng vòng tròn
        for (let j = turrets.length - 1; j >= 0; j--) {
          const t = turrets[j];
          const d2 = dist2(cx, cy, t.x, t.y);
          if (d2 >= rMin2 && d2 <= rMax2) {
            t.hp -= (L.dps || LASER_SKILL_DPS) * dt;
            if (t.hp <= 0) {
              spawnExplosion(t.x, t.y, 60, "enemy");
              turrets.splice(j, 1);
              state.score += 300;
              updateHUD();
            }
          }
        }

        // Gây sát thương cho trùm nếu vòng chạm
        if (boss) {
          const d2B = dist2(cx, cy, boss.x, boss.y);
          if (d2B >= rMin2 && d2B <= rMax2) {
            boss.hp -= (L.dps || LASER_SKILL_DPS) * dt;
            if (boss.hp <= 0) {
              spawnExplosion(boss.x, boss.y, 200, "enemy");
              boss = null;
              turrets.length = 0;
              state.score += 2000;
              updateHUD();
              if (!state.won) {
                winGame();
                return;
              }
            }
          }
        }

      } else {
        // Fallback: tia dọc cũ
        const half = L.width * 0.5;
        const left = L.x - half;
        const right = L.x + half;

        // Remove enemies in beam
        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          if (e.x >= left && e.x <= right) {
            explodeEnemy(e);
            enemies.splice(j, 1);
            state.score += (e.type === "miniBoss" ? 800 : 100);
            updateHUD();
          }
        }
        // Remove enemy bullets in beam (excluding enemy lasers)
        for (let j = eBullets.length - 1; j >= 0; j--) {
          const b = eBullets[j];
          if (b.type === "laser") continue;
          if (b.x >= left && b.x <= right) {
            eBullets.splice(j, 1);
          }
        }
        // Damage turrets in beam
        for (let j = turrets.length - 1; j >= 0; j--) {
          const t = turrets[j];
          if (t.x >= left && t.x <= right) {
            t.hp -= 40 * dt;
            if (t.hp <= 0) {
              spawnExplosion(t.x, t.y, 60, "enemy");
              turrets.splice(j, 1);
              state.score += 300;
              updateHUD();
            }
          }
        }
        // Damage boss in beam
        if (boss && boss.x >= left && boss.x <= right) {
          boss.hp -= 300 * dt;
          if (boss.hp <= 0) {
            spawnExplosion(boss.x, boss.y, 200, "enemy");
            boss = null;
            turrets.length = 0;
            state.score += 2000;
            updateHUD();
            if (!state.won) {
              winGame();
              return;
            }
          }
        }
      }

      // Hết thời gian hoạt động
      if (L.fire <= 0) {
        if (L.shield) state.shieldActive = false;
        allyLasers.splice(i, 1);
      }
    }
    if (discipleBtn && state.discipleCooldown <= 0) {
      discipleBtn.classList.remove("active");
    }

    updateParticles(dt);
    updateDamageTexts(dt);

    // Collisions: player bullets vs enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      let hit = false;
      for (let j = pBullets.length - 1; j >= 0; j--) {
        const b = pBullets[j];
        const rr = (e.r + b.r) * (e.r + b.r);
        if (dist2(e.x, e.y, b.x, b.y) <= rr) {
          pBullets.splice(j, 1);
          e.hp -= (b.dmg || 1);
          spawnDamageText(b.x, b.y, (b.dmg || 1), "#e9faff");
          hit = true;
          if (e.hp <= 0) break;
        }
      }
      if (e.hp <= 0) {
        explodeEnemy(e);
        enemies.splice(i, 1);
        state.score += (e.type === "miniBoss" ? 800 : 100);
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

    // Collisions: player bullets vs turrets
  for (let i = turrets.length - 1; i >= 0; i--) {
    const t = turrets[i];
    let hit = false;
    for (let j = pBullets.length - 1; j >= 0; j--) {
      const b = pBullets[j];
      const rr = (t.r + b.r) * (t.r + b.r);
      if (dist2(t.x, t.y, b.x, b.y) <= rr) {
        pBullets.splice(j, 1);
        t.hp -= (b.dmg || 1);
        spawnDamageText(b.x, b.y, (b.dmg || 1), "#3b82f6");
        hit = true;
        if (t.hp <= 0) break;
      }
    }
    if (t.hp <= 0) {
      spawnExplosion(t.x, t.y, 40, "enemy");
      turrets.splice(i, 1);
      state.score += 300;
      updateHUD();
      continue;
    }
  }

  // Collisions: player bullets vs boss
    if (boss) {
      for (let j = pBullets.length - 1; j >= 0; j--) {
        const b = pBullets[j];
        const rrB = (boss.r + b.r) * (boss.r + b.r);
        if (dist2(boss.x, boss.y, b.x, b.y) <= rrB) {
          pBullets.splice(j, 1);
          boss.hp -= (b.dmg || 1);
          spawnDamageText(b.x, b.y, (b.dmg || 1), "#dbeafe");
          if (boss.hp <= 0) {
            spawnExplosion(boss.x, boss.y, 200, "enemy");
            boss = null;
            turrets.length = 0;
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
        if (!state.shieldActive) {
          damagePlayer();
        }
      }
    }

    // Boss trigger theo điểm (trừ khi đang ở chế độ Trận Trùm): đạt 5000 điểm sẽ gặp trùm; hạ trùm là thắng
    if (!state.dead && !state.won && state.mode !== "boss") {
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
    const base = 5;
    const taken = Math.max(1, base - (state.defense || 0));
    state.lives -= taken;
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
      ctx.fillStyle = starColor;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // Player bullets (tăng hiệu ứng theo kích thước đạn/DMG)
    for (let b of pBullets) {
      const g = ctx.createRadialGradient(b.x, b.y, Math.max(1, b.r * 0.3), b.x, b.y, b.r + gs(6));
      g.addColorStop(0, "rgba(233,250,255,1)");
      g.addColorStop(0.6, "rgba(46,230,255,0.85)");
      g.addColorStop(1, "rgba(46,230,255,0.05)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + gs(3), 0, Math.PI * 2);
      ctx.fill();
    }


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
        const g = ctx.createRadialGradient(b.x, b.y, Math.max(1, b.r * 0.3), b.x, b.y, b.r + gs(6));
        g.addColorStop(0, "rgba(219,234,254,1)");
        g.addColorStop(0.6, "rgba(59,130,246,0.85)");
        g.addColorStop(1, "rgba(59,130,246,0.05)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + gs(3), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Drones and their bullets
    drawDBullets();
    drawDrones();
    // Friendly lasers (disciple)
    drawAllyLasers();

    // Enemies
    for (let e of enemies) {
      drawEnemy(e);
    }

    // Boss
    if (boss) {
      drawBoss(boss);
    }

    // Turrets (left/right of boss)
    for (let t of turrets) {
      drawTurret(t);
    }

    // Explosions
    drawParticles();
    // Damage numbers on top
    drawDamageTexts();

    // Wingmen
    for (let wm of wingmen) {
      drawWingman(wm);
    }

    // Player
    if (!state.dead) drawPlayer();

    // Homing missiles (draw on top of ships for visibility)
    drawMissiles();
  }

  function drawPlayer() {
    const t = nowMs();
    const flicker = t < player.invUntil && Math.floor(t / 100) % 2 === 0;
    if (flicker) return; // blink during invincibility

    const { x, y, w, h } = player;

    // Ship body (triangle)
    ctx.save();
    ctx.translate(x, y);

    // Hiệu ứng khi có phòng thủ (DEF): hào quang quanh tàu
    if ((state.defense || 0) > 0) {
      const rShield = Math.max(w, h) * 0.6 + state.defense * 2;
      const sg = ctx.createRadialGradient(0, 0, rShield * 0.4, 0, 0, rShield);
      sg.addColorStop(0, "rgba(46,230,255,0.25)");
      sg.addColorStop(1, "rgba(46,230,255,0.0)");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(0, 0, rShield, 0, Math.PI * 2);
      ctx.fill();
    }

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

  function drawTurret(t) {
    ctx.save();
    ctx.translate(t.x, t.y);

    // glow
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, t.r + 8);
    g.addColorStop(0, "rgba(59,130,246,0.25)");
    g.addColorStop(1, "rgba(59,130,246,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, t.r + 8, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillStyle = "#60a5fa";
    const w = t.w, h = t.h;
    ctx.beginPath();
    ctx.rect(-w * 0.4, -h * 0.3, w * 0.8, h * 0.6);
    ctx.fill();

    // barrel
    ctx.fillStyle = "#dbeafe";
    ctx.fillRect(-w * 0.08, -h * 0.55, w * 0.16, h * 0.5);

    ctx.restore();

    // HP bar above turret (10 segments)
    const barW = Math.min(gs(120), gs(60));
    const barH = gs(6);
    const bx = t.x - barW * 0.5;
    const by = t.y - t.h * 0.9 - barH;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = "#3b82f6";
    const ratio = clamp(t.hp / (t.maxHp || 10), 0, 1);
    ctx.fillRect(bx, by, barW * ratio, barH);
    // segment separators (10)
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 1; i < 10; i++) {
      const x = bx + (barW * i) / 10;
      ctx.fillRect(Math.round(x) - 1, by, 2, barH);
    }
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

  function makeTurret(offsetX, offsetY) {
    const w = gs(36), h = gs(28);
    const r = gs(14);
    return {
      type: "turret",
      offsetX, offsetY,
      x: 0, y: 0,
      w, h, r,
      maxHp: 10,
      hp: 10,
      mgBurstTimer: rand(0.6, 1.2),
      mgShotTimer: 0,
      mgShotsRemaining: 0,
      mgShotInterval: 0.08
    };
  }

  function spawnBoss(config = {}) {
    const entryY = Math.max(gs(150), getHudHeight() + gs(120));
    const hp = config.hp || (state.mode === "boss" ? 1000 : 10000);
    boss = {
      x: cw * 0.5,
      y: -gs(120),
      w: gs(140),
      h: gs(120),
      r: gs(60),
      maxHp: hp,
      hp: hp,
      t: 0,
      entryY,
      entering: true,
      orbTimer: 1.0,
      laserTimer: 2.5,
      mode: config.mode || state.mode || "normal",
      phaseName: "mg",
      phaseTimer: 5.0,
      orbRapidTimer: 0,
      summonCd: 0
    };
    state.bossSpawned = true;

    // Spawn side turrets attached to boss
    const offX = boss.w * 0.6;
    const offY = boss.h * 0.05;
    turrets.length = 0;
    turrets.push(makeTurret(-offX, offY));
    turrets.push(makeTurret(offX, offY));
  }
  function updateBoss(dt) {
    if (!boss) return;
    boss.t += dt;

    // Movement
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

    if (boss.mode === "boss") {
      // Phase cycle: MG -> Orbs burst -> Summon minions
      boss.phaseTimer -= dt;
      if (boss.phaseTimer <= 0) {
        boss.phaseName = boss.phaseName === "mg" ? "orbs" : (boss.phaseName === "orbs" ? "summon" : "mg");
        boss.phaseTimer = boss.phaseName === "mg" ? 5.0 : (boss.phaseName === "orbs" ? 5.0 : 6.0);
        boss.orbRapidTimer = 0;
        boss.summonCd = 0;
      }

      if (boss.phaseName === "orbs") {
        // Burst of exploding energy orbs, like a rapid-fire spread
        boss.orbRapidTimer -= dt;
        if (boss.orbRapidTimer <= 0) {
          const shots = 2;
          for (let i = 0; i < shots; i++) {
            const d = Math.atan2(player.y - boss.y, player.x - boss.x) + rand(-0.12, 0.12);
            const spd = gs(260) / ENEMY_BULLET_SPEED_DIVISOR;
            const vx = Math.cos(d) * spd;
            const vy = Math.sin(d) * spd;
            const r = gs(10);
            const fuse = 2.0;
            const explodeR = gs(80);
            const minTravel = Math.min(cw, ch) * 0.3;
            const friction = 0.9985;
            eBullets.push({ type: "orb", x: boss.x, y: boss.y + boss.h * 0.4, vx, vy, r, fuse, maxFuse: fuse, explodeR, minTravel, traveled: 0, friction });
          }
          boss.orbRapidTimer = 0.15;
        }
      } else if (boss.phaseName === "summon") {
        // Summon small minions that shoot normal bullets
        boss.summonCd -= dt;
        if (boss.summonCd <= 0) {
          const sx = clamp(boss.x + gs(rand(-120, 120)), gs(40), cw - gs(40));
          const sy = boss.y + boss.h * 0.5 + gs(rand(20, 60));
          const size = gs(rand(22, 28));
          const vy = gs(rand(70, 110)) / ENEMY_SPEED_DIVISOR;
          enemies.push({
            type: "minion",
            x: sx, y: sy,
            w: size, h: size * 1.1, r: size * 0.55,
            vy,
            t: 0,
            amp: gs(rand(20, 60)) / ENEMY_SPEED_DIVISOR,
            fireCd: rand(0.8, 1.4),
            fireTimer: rand(0.2, 0.6),
            hp: 2
          });
          boss.summonCd = rand(0.6, 1.0);
        }
      }

      // In dedicated boss mode: disable default laser attack
      // Still allow some baseline single orbs occasionally between bursts
      boss.orbTimer -= dt;
      if (boss.orbTimer <= 0) {
        const d = Math.atan2(player.y - boss.y, player.x - boss.x) + rand(-0.06, 0.06);
        const spd = gs(240) / ENEMY_BULLET_SPEED_DIVISOR;
        const vx = Math.cos(d) * spd;
        const vy = Math.sin(d) * spd;
        const r = gs(12);
        const fuse = 3.2;
        const explodeR = gs(90);
        const minTravel = Math.min(cw, ch) * 0.35;
        const friction = 0.998;
        eBullets.push({ type: "orb", x: boss.x, y: boss.y + boss.h * 0.4, vx, vy, r, fuse, maxFuse: fuse, explodeR, minTravel, traveled: 0, friction });
        boss.orbTimer = rand(1.0, 1.8);
      }
    } else {
      // Default boss behavior (non-boss mode): orbs + occasional vertical laser
      boss.orbTimer -= dt;
      if (boss.orbTimer <= 0) {
        const d = Math.atan2(player.y - boss.y, player.x - boss.x) + rand(-0.05, 0.05);
        const spd = gs(240) / ENEMY_BULLET_SPEED_DIVISOR; // slightly faster so it can travel farther
        const vx = Math.cos(d) * spd;
        const vy = Math.sin(d) * spd;
        const r = gs(12);
        const fuse = 4.0; // longer fuse so it won't explode too soon
        const explodeR = gs(90);
        const minTravel = Math.min(cw, ch) * 0.35; // must fly far before exploding
        const friction = 0.998; // retain more speed over time
        eBullets.push({ type: "orb", x: boss.x, y: boss.y + boss.h * 0.4, vx, vy, r, fuse, maxFuse: fuse, explodeR, minTravel, traveled: 0, friction });
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

    // Update turrets (follow boss and fire MG)
    for (let t of turrets) {
      t.x = boss.x + t.offsetX;
      t.y = boss.y + t.offsetY;

      t.mgBurstTimer -= dt;
      if (t.mgBurstTimer <= 0 && t.mgShotsRemaining <= 0) {
        t.mgShotsRemaining = 15;
        t.mgShotTimer = 0;
        t.mgBurstTimer = rand(1.2, 2.0);
      }
      if (t.mgShotsRemaining > 0) {
        t.mgShotTimer -= dt;
        if (t.mgShotTimer <= 0) {
          const d = Math.atan2(player.y - t.y, player.x - t.x) + rand(-0.04, 0.04);
          const spd = (gs(360) / ENEMY_BULLET_SPEED_DIVISOR) * (state.tuning.enemyBulletSpeedMul || 1);
          const vx = Math.cos(d) * spd;
          const vy = Math.sin(d) * spd;
          eBullets.push({ x: t.x, y: t.y, vx, vy, r: gs(3.3) });
          t.mgShotsRemaining -= 1;
          // Faster MG during MG phase in boss mode
          let interval = (boss.mode === "boss" && boss.phaseName === "mg") ? 0.06 : t.mgShotInterval;
          interval = interval / (state.tuning.enemyFireRateMul || 1);
          t.mgShotTimer = interval;
        }
      }
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
    if (state.paused) { return; }
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
    // Cooldowns decrease in real-time (not affected by time slow)
    if (state.mgCooldown > 0) state.mgCooldown = Math.max(0, state.mgCooldown - dt);
    if (state.missileCooldown > 0) state.missileCooldown = Math.max(0, state.missileCooldown - dt);
    if (state.discipleCooldown > 0) state.discipleCooldown = Math.max(0, state.discipleCooldown - dt);
    // Đếm lùi vòng bảo hộ theo thời gian thực
    if (state.shieldActive) {
      state.shieldTimer = Math.max(0, state.shieldTimer - dt);
      if (state.shieldTimer <= 0) {
        state.shieldActive = false;
        for (let i = allyLasers.length - 1; i >= 0; i--) {
          const L = allyLasers[i];
          if (L && L.shield) allyLasers.splice(i, 1);
        }
        if (discipleBtn) discipleBtn.classList.remove("active");
      }
    }
    updateCooldownUI();
    const tScale = state.timeVibeActive ? state.timeVibeFactor : 1;

    update(dt * tScale);
    draw();
    requestAnimationFrame(loop);
  }

   // Kick off in menu state
  document.body.classList.add("menu-active");
  overlay.classList.remove("hidden");
})();
