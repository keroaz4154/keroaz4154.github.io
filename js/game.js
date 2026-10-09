/* =========================================================
   Madium Games Hub — три режима на одном canvas:
   1) Неоновая арена  — топ-даун шутер (волны роя)
   2) Mineplace        — 2D-майнкрафт (песочница)
   3) Nebula Strike    — шутер + 6-гранник с ритмом Q·E·R·F
   ========================================================= */
(function () {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  /* ---------- UI refs ---------- */
  const overlay = document.getElementById("gameOverlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText = document.getElementById("overlayText");
  const startBtn = document.getElementById("startBtn");
  const hpBar = document.getElementById("hpBar");
  const scoreVal = document.getElementById("scoreVal");
  const waveVal = document.getElementById("waveVal");
  const bestVal = document.getElementById("bestVal");
  const scoreLbl = document.getElementById("scoreLbl");
  const waveLbl = document.getElementById("waveLbl");
  const bestLbl = document.getElementById("bestLbl");
  const qteHud = document.getElementById("qteHud");
  const qteVal = document.getElementById("qteVal");
  const gameTip = document.getElementById("gameTip");
  const gameKeys = document.getElementById("gameKeys");
  const picker = document.getElementById("gamePicker");

  /* ---------- utils ---------- */
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function getBest(key) {
    /* рекорды синхронизируются с аккаунтом (window.MadiumScores из main.js) */
    if (window.MadiumScores && window.MadiumScores.get) {
      try { return window.MadiumScores.get(key); } catch (e) {}
    }
    try { return +localStorage.getItem(key) || 0; } catch (e) { return 0; }
  }
  function setBest(key, val) {
    if (window.MadiumScores && window.MadiumScores.set) {
      try { window.MadiumScores.set(key, val); return; } catch (e) {}
    }
    try { localStorage.setItem(key, String(val)); } catch (e) {}
  }

  function pathRoundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- shared input ---------- */
  const keys = Object.create(null);
  const presses = []; // discrete keydowns for the current frame
  const mouse = { x: W / 2, y: H / 2, down: false, lclick: false, rclick: false, inside: false };
  const touch = { active: false, x: 0, y: 0 };

  function toCanvas(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left) * (W / r.width), y: (clientY - r.top) * (H / r.height) };
  }

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (!e.repeat) presses.push(k);
    keys[k] = true;
    const moveKeys = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "];
    if (moveKeys.includes(k) && hub.state === "play") e.preventDefault();
    if (k === "p" || k === "escape") hub.togglePause();
  });
  window.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));
  window.addEventListener("blur", () => {
    for (const k in keys) keys[k] = false;
    mouse.down = false;
    touch.active = false;
  });

  canvas.addEventListener("mousemove", (e) => {
    const p = toCanvas(e.clientX, e.clientY);
    mouse.x = p.x; mouse.y = p.y; mouse.inside = true;
  });
  canvas.addEventListener("mouseleave", () => (mouse.inside = false));
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) { mouse.down = true; mouse.lclick = true; }
    if (e.button === 2) mouse.rclick = true;
  });
  window.addEventListener("mouseup", () => (mouse.down = false));
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const p = toCanvas(e.touches[0].clientX, e.touches[0].clientY);
    touch.active = true; touch.x = p.x; touch.y = p.y;
    mouse.x = p.x; mouse.y = p.y; mouse.down = true; mouse.lclick = true;
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const p = toCanvas(e.touches[0].clientX, e.touches[0].clientY);
    touch.x = p.x; touch.y = p.y; mouse.x = p.x; mouse.y = p.y;
  }, { passive: false });
  const endTouch = () => { touch.active = false; mouse.down = false; };
  canvas.addEventListener("touchend", endTouch);
  canvas.addEventListener("touchcancel", endTouch);

  /* ---------- shared fx ---------- */
  function createFx() {
    const particles = [];
    const floats = [];
    return {
      particles, floats,
      clear() { particles.length = 0; floats.length = 0; },
      burst(x, y, color, n, power) {
        for (let i = 0; i < n; i++) {
          const a = rand(0, Math.PI * 2);
          const s = rand(0.3, 1) * power;
          particles.push({
            x, y,
            vx: Math.cos(a) * s, vy: Math.sin(a) * s,
            life: rand(0.3, 0.7), maxLife: 0.7,
            size: rand(1.5, 4), color,
          });
        }
      },
      float(x, y, text, color) { floats.push({ x, y, text, color, life: 1 }); },
      update(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vx *= 0.94; p.vy *= 0.94;
          p.life -= dt;
          if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = floats.length - 1; i >= 0; i--) {
          const f = floats[i];
          f.y -= 34 * dt;
          f.life -= dt * 1.1;
          if (f.life <= 0) floats.splice(i, 1);
        }
      },
      draw() {
        ctx.save();
        particles.forEach((p) => {
          ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        });
        ctx.globalAlpha = 1;
        ctx.font = '800 18px "JetBrains Mono", monospace';
        ctx.textAlign = "center";
        floats.forEach((f) => {
          ctx.globalAlpha = clamp(f.life, 0, 1);
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x, f.y);
        });
        ctx.globalAlpha = 1;
        ctx.restore();
      },
    };
  }

  /* ---------- shared drawing (neon games) ---------- */
  let neonGrad = null;
  function drawNeonBg(t) {
    ctx.fillStyle = "#05050b";
    ctx.fillRect(0, 0, W, H);
    const off = (t * 14) % 48;
    ctx.strokeStyle = "rgba(124,92,255,0.10)";
    ctx.lineWidth = 1;
    for (let x = -off; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = -off; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    if (!neonGrad) {
      neonGrad = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.6);
      neonGrad.addColorStop(0, "rgba(0,224,198,0.05)");
      neonGrad.addColorStop(1, "rgba(0,0,0,0)");
    }
    ctx.fillStyle = neonGrad;
    ctx.fillRect(0, 0, W, H);
  }

  let vignetteGrad = null;
  function drawVignette() {
    if (!vignetteGrad) {
      vignetteGrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
      vignetteGrad.addColorStop(0, "rgba(0,0,0,0)");
      vignetteGrad.addColorStop(1, "rgba(0,0,0,0.55)");
    }
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, W, H);
  }

  /* =========================================================
     SHOOTER CORE (Неоновая арена + Nebula Strike)
     ========================================================= */
  const ENEMY_TYPES = {
    grunt:  { r: 14, hp: 3,  speed: 58,  dmg: 12, color: "#ff4d8d", score: 10 },
    runner: { r: 10, hp: 1,  speed: 115, dmg: 8,  color: "#ffb84d", score: 15 },
    tank:   { r: 23, hp: 10, speed: 42,  dmg: 22, color: "#7c5cff", score: 30 },
  };

  function createCore() {
    const fx = createFx();
    const c = {
      fx, wave: 1,
      player: null, bullets: [], enemies: [], drops: [],
      shake: 0, elapsed: 0,
    };

    c.reset = function () {
      c.player = { x: W / 2, y: H / 2, r: 13, hp: 100, maxHp: 100, speed: 150, invuln: 0, fireCd: 0, angle: 0 };
      c.bullets = []; c.enemies = []; c.drops = [];
      c.shake = 0; c.elapsed = 0; c.wave = 1;
      fx.clear();
    };

    c.hurt = function (dmg) {
      const p = c.player;
      if (p.invuln > 0) return false;
      p.hp -= dmg;
      p.invuln = 0.75;
      c.shake = 8;
      fx.burst(p.x, p.y, "#ff5c5c", 14, 160);
      return p.hp <= 0;
    };

    c.control = function (dt) {
      const p = c.player;
      let dx = 0, dy = 0;
      if (keys["w"] || keys["arrowup"]) dy -= 1;
      if (keys["s"] || keys["arrowdown"]) dy += 1;
      if (keys["a"] || keys["arrowleft"]) dx -= 1;
      if (keys["d"] || keys["arrowright"]) dx += 1;

      if (touch.active) {
        const tx = touch.x - p.x, ty = touch.y - p.y;
        const d = Math.hypot(tx, ty);
        if (d > 8) { dx = tx / d; dy = ty / d; }
      } else if (dx || dy) {
        const d = Math.hypot(dx, dy);
        dx /= d; dy /= d;
      }

      p.x = clamp(p.x + dx * p.speed * dt, p.r, W - p.r);
      p.y = clamp(p.y + dy * p.speed * dt, p.r, H - p.r);

      p.angle = Math.atan2(mouse.y - p.y, mouse.x - p.x);
      if (p.invuln > 0) p.invuln -= dt;
      p.fireCd -= dt;

      if ((mouse.down || keys[" "]) && p.fireCd <= 0) {
        p.fireCd = 0.13;
        const a = p.angle;
        c.bullets.push({
          x: p.x + Math.cos(a) * 18, y: p.y + Math.sin(a) * 18,
          vx: Math.cos(a) * 640, vy: Math.sin(a) * 640,
          life: 1.1, r: 4,
        });
        fx.burst(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, "#00e0c6", 2, 60);
      }
    };

    c.updateBullets = function (dt) {
      for (let i = c.bullets.length - 1; i >= 0; i--) {
        const b = c.bullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) c.bullets.splice(i, 1);
      }
    };

    c.spawnEnemy = function (wave) {
      const roll = Math.random();
      let type = "grunt";
      if (wave >= 3 && roll > 0.78) type = "runner";
      if (wave >= 4 && roll > 0.92) type = "tank";
      const t = ENEMY_TYPES[type];
      const side = Math.floor(Math.random() * 4);
      let x, y;
      if (side === 0) { x = rand(0, W); y = -t.r; }
      else if (side === 1) { x = W + t.r; y = rand(0, H); }
      else if (side === 2) { x = rand(0, W); y = H + t.r; }
      else { x = -t.r; y = rand(0, H); }
      const hpScale = 1 + (wave - 1) * 0.18;
      c.enemies.push({
        type, x, y, r: t.r,
        hp: Math.ceil(t.hp * hpScale), maxHp: Math.ceil(t.hp * hpScale),
        speed: t.speed * (1 + (wave - 1) * 0.05),
        dmg: t.dmg, color: t.color, score: t.score,
        hit: 0, wob: rand(0, Math.PI * 2),
      });
    };

    /* movement + contact damage; returns true if player died */
    c.moveEnemies = function (dt) {
      const p = c.player;
      let died = false;
      for (let i = c.enemies.length - 1; i >= 0; i--) {
        const e = c.enemies[i];
        const ang = Math.atan2(p.y - e.y, p.x - e.x);
        e.wob += dt * 3;
        const wobble = e.type === "runner" ? Math.sin(e.wob) * 0.4 : 0;
        e.x += Math.cos(ang + wobble) * e.speed * dt;
        e.y += Math.sin(ang + wobble) * e.speed * dt;
        if (e.hit > 0) e.hit -= dt;

        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < e.r + p.r && p.invuln <= 0) {
          if (c.hurt(e.dmg)) died = true;
          e.x -= Math.cos(ang) * 30;
          e.y -= Math.sin(ang) * 30;
        }
      }
      return died;
    };

    c.handleBullets = function (onKill) {
      const c0 = c;
      for (let i = c0.enemies.length - 1; i >= 0; i--) {
        const e = c0.enemies[i];
        for (let j = c0.bullets.length - 1; j >= 0; j--) {
          const b = c0.bullets[j];
          if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + b.r) {
            c0.bullets.splice(j, 1);
            e.hp -= 1;
            e.hit = 0.12;
            c0.fx.burst(b.x, b.y, e.color, 5, 130);
            if (e.hp <= 0) {
              c0.enemies.splice(i, 1);
              c0.fx.burst(e.x, e.y, e.color, 18, 220);
              onKill(e);
            }
            break;
          }
        }
      }
    };

    c.updateDrops = function (dt) {
      const p = c.player;
      for (let i = c.drops.length - 1; i >= 0; i--) {
        const d = c.drops[i];
        d.life -= dt; d.bob += dt * 4;
        if (d.life <= 0) { c.drops.splice(i, 1); continue; }
        if (Math.hypot(d.x - p.x, d.y - p.y) < d.r + p.r) {
          p.hp = Math.min(p.maxHp, p.hp + 25);
          fx.float(d.x, d.y, "+25 HP", "#3ddc97");
          fx.burst(d.x, d.y, "#3ddc97", 12, 150);
          c.drops.splice(i, 1);
        }
      }
    };

    c.tick = function (dt) {
      c.elapsed += dt;
      if (c.shake > 0) c.shake = Math.max(0, c.shake - dt * 26);
    };

    c.drawWorld = function () {
      ctx.save();
      if (c.shake > 0) ctx.translate(rand(-c.shake, c.shake), rand(-c.shake, c.shake));
      drawNeonBg(c.elapsed);

      c.drops.forEach((d) => {
        const bob = Math.sin(d.bob) * 3;
        ctx.save();
        ctx.translate(d.x, d.y + bob);
        ctx.shadowColor = "#3ddc97"; ctx.shadowBlur = 14;
        ctx.fillStyle = "#3ddc97";
        ctx.fillRect(-8, -3, 16, 6);
        ctx.fillRect(-3, -8, 6, 16);
        ctx.restore();
      });

      ctx.shadowColor = "#00e0c6"; ctx.shadowBlur = 12;
      c.bullets.forEach((b) => {
        ctx.fillStyle = "#d7fff8";
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      });
      ctx.shadowBlur = 0;

      c.enemies.forEach((e) => {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.shadowColor = e.color; ctx.shadowBlur = 18;
        ctx.fillStyle = e.hit > 0 ? "#ffffff" : e.color;
        ctx.beginPath();
        const sides = e.type === "tank" ? 6 : e.type === "runner" ? 3 : 4;
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2 - Math.PI / 2 + e.wob * (e.type === "tank" ? 0.3 : 0);
          const x = Math.cos(a) * e.r, y = Math.sin(a) * e.r;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill();
        if (e.hp < e.maxHp) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillRect(-e.r, -e.r - 9, e.r * 2, 4);
          ctx.fillStyle = "#3ddc97";
          ctx.fillRect(-e.r, -e.r - 9, e.r * 2 * (e.hp / e.maxHp), 4);
        }
        ctx.restore();
      });
      ctx.restore();
    };

    c.drawPlayer = function () {
      const p = c.player;
      ctx.save();
      ctx.translate(p.x, p.y);
      const blink = p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0;
      ctx.globalAlpha = blink ? 0.4 : 1;
      ctx.shadowColor = "#00e0c6"; ctx.shadowBlur = 22;
      ctx.fillStyle = "#00e0c6";
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#05050b";
      ctx.beginPath(); ctx.arc(0, 0, p.r - 5, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(p.angle);
      ctx.fillStyle = "#eafffb";
      ctx.fillRect(4, -3, 18, 6);
      ctx.restore();
    };

    c.drawFx = function () {
      fx.draw();
      drawVignette();
    };

    c.idle = function (dt) { c.tick(dt); fx.update(dt); };

    return c;
  }

  /* =========================================================
     GAME 1 — Неоновая арена
     ========================================================= */
  function createArena() {
    const core = createCore();
    const BEST = "md_arena_best";
    let score = 0, kills = 0, killsNeeded = 10, spawnTimer = 0, best = 0;

    const g = {
      id: "arena",
      title: "Неоновая арена",
      intro: "Отбивайся от роя, собирай аптечки и держись как можно дольше.<br><b>WASD</b> — движение · <b>мышь</b> — прицел и стрельба · <b>P</b> — пауза",
      tip: "",
      tips: [
        "Совет: стреляй на ходу, не стой на месте.",
        "Совет: зелёные кубики лечат на 25 HP.",
        "Совет: танки (фиолетовые) медленные — добивай с дистанции.",
        "Совет: за каждую волну дают +100 очков.",
      ],
      keysHint: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> движение <kbd>ЛКМ</kbd> огонь <kbd>P</kbd> пауза',
      hud: { score: "Счёт", wave: "Волна", best: "Рекорд", qte: false },

      reset() {
        core.reset();
        score = 0; kills = 0; killsNeeded = 10; spawnTimer = 1.2;
        best = getBest(BEST);
        sync();
      },
      sync() {
        setHud({
          hp: (core.player.hp / core.player.maxHp) * 100,
          score, wave: core.wave, best,
        });
      },
      resyncBest() { best = getBest(BEST); }, // синхронизация с аккаунтом
      update(dt) {
        core.tick(dt);
        core.control(dt);
        core.updateBullets(dt);

        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          core.spawnEnemy(core.wave);
          if (core.wave > 5 && Math.random() > 0.55) core.spawnEnemy(core.wave);
          spawnTimer = Math.max(0.28, 1.35 - core.wave * 0.09);
        }

        const died = core.moveEnemies(dt);

        core.handleBullets((e) => {
          score += e.score;
          kills++;
          core.fx.float(e.x, e.y, "+" + e.score, e.color);
          if (Math.random() < 0.09 && core.player.hp < core.player.maxHp) {
            core.drops.push({ x: e.x, y: e.y, r: 9, life: 10, bob: rand(0, 6.3) });
          }
          if (kills >= killsNeeded) {
            core.wave++;
            kills = 0;
            killsNeeded = 8 + core.wave * 4;
            score += 100;
            core.fx.float(W / 2, H / 2 - 60, "WAVE " + core.wave + "  +100", "#00e0c6");
          }
          if (score > best) { best = score; setBest(BEST, best); }
        });

        core.updateDrops(dt);
        core.fx.update(dt);
        sync();
        return died ? "over" : null;
      },
      idle(dt) { core.idle(dt); },
      debug() {
        return { x: core.player.x, y: core.player.y, hp: core.player.hp, bullets: core.bullets.length, down: mouse.down };
      },
      draw() { core.drawWorld(); core.drawPlayer(); core.drawFx(); },
      over() {
        const isRecord = score >= best && score > 0;
        return {
          title: isRecord ? "Рекорд побит! 🏆" : "Игра окончена",
          html: `Счёт: <b>${score}</b> · волна <b>${core.wave}</b> · рекорд: <b>${best}</b>`,
        };
      },
    };

    function sync() { g.sync(); }
    return g;
  }

  /* =========================================================
     GAME 2 — Mineplace (2D майнкрафт)
     ========================================================= */
  function createMine() {
    const TW = 24;            // tile size, px
    const MW = 170, MH = 56;  // world size in tiles
    const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, WOOD = 4, LEAVES = 5, BRICK = 6, BEDROCK = 7;
    const COLORS = {
      [GRASS]: "#4caf50", [DIRT]: "#8d6e63", [STONE]: "#9aa0a6", [WOOD]: "#a1744f",
      [LEAVES]: "#388e3c", [BRICK]: "#c15b4a", [BEDROCK]: "#37474f",
    };
    const NAMES = { [GRASS]: "Трава", [DIRT]: "Земля", [STONE]: "Камень", [WOOD]: "Дерево", [LEAVES]: "Листва", [BRICK]: "Кирпич" };
    const SLOTS = [DIRT, STONE, WOOD, LEAVES, BRICK, GRASS];

    const BEST = "md_mine_best";
    let blocks = new Uint8Array(MW * MH);
    let px = 0, py = 0, vx = 0, vy = 0, onGround = false;
    const PW = 16, PH = 30;
    let camX = 0, camY = 0;
    let slot = 0, mined = 0, best = 0, hp = 100, spawnX = 0, spawnY = 0, time = 0;
    const fx = createFx();

    let camDX = 0, camDY = 0; // rounded camera: drawing + block picking
    let acc = 0;              // physics accumulator (fixed timestep)
    let skyGrad = null;       // cached sky gradient

    /* offscreen world layer: tiles are rasterized once per change,
       each frame we only blit the visible slice (was ~6000 fillRect/frame) */
    const worldCv = document.createElement("canvas");
    worldCv.width = MW * TW;
    worldCv.height = MH * TW;
    const wctx = worldCv.getContext("2d");

    function paintTile(c, tx, ty, b) {
      const x = tx * TW, y = ty * TW;
      c.fillStyle = COLORS[b];
      c.fillRect(x, y, TW, TW);
      c.fillStyle = "rgba(0,0,0,0.10)";
      c.fillRect(x, y + TW - 4, TW, 4);
      c.fillRect(x + TW - 4, y, 4, TW);
      if (b === GRASS) {
        c.fillStyle = "#7ddc6a";
        c.fillRect(x, y, TW, 7);
      } else if (b === LEAVES) {
        c.fillStyle = "rgba(255,255,255,0.10)";
        c.fillRect(x + 4, y + 4, 6, 6);
        c.fillRect(x + 14, y + 12, 5, 5);
      } else if (b === STONE) {
        c.fillStyle = "rgba(255,255,255,0.12)";
        c.fillRect(x + 5, y + 6, 5, 5);
        c.fillRect(x + 13, y + 14, 4, 4);
      } else if (b === BRICK) {
        c.strokeStyle = "rgba(0,0,0,0.25)";
        c.lineWidth = 2;
        c.strokeRect(x + 1, y + 1, TW - 2, TW - 2);
        c.beginPath();
        c.moveTo(x, y + TW / 2); c.lineTo(x + TW, y + TW / 2);
        c.moveTo(x + TW / 2, y); c.lineTo(x + TW / 2, y + TW / 2);
        c.stroke();
      } else if (b === BEDROCK) {
        c.fillStyle = "rgba(255,255,255,0.08)";
        c.fillRect(x + 4, y + 5, 7, 6);
        c.fillRect(x + 13, y + 13, 6, 6);
      }
    }

    function rebuildWorld() {
      wctx.clearRect(0, 0, worldCv.width, worldCv.height);
      for (let ty = 0; ty < MH; ty++)
        for (let tx = 0; tx < MW; tx++) {
          const b = blocks[idx(tx, ty)];
          if (b !== AIR) paintTile(wctx, tx, ty, b);
        }
    }

    function repaintTile(tx, ty) {
      if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) return;
      wctx.clearRect(tx * TW, ty * TW, TW, TW);
      const b = blocks[idx(tx, ty)];
      if (b !== AIR) paintTile(wctx, tx, ty, b);
    }

    const idx = (x, y) => y * MW + x;
    function getBlock(x, y) {
      if (x < 0 || x >= MW || y >= MH) return BEDROCK;
      if (y < 0) return AIR;
      return blocks[idx(x, y)];
    }
    function setBlock(x, y, v) {
      if (x < 0 || x >= MW || y < 0 || y >= MH) return;
      blocks[idx(x, y)] = v;
    }
    const solid = (x, y) => getBlock(x, y) !== AIR;

    function surfaceY(x) {
      for (let y = 0; y < MH; y++) if (getBlock(x, y) !== AIR) return y;
      return MH - 1;
    }

    function generate() {
      blocks = new Uint8Array(MW * MH);
      let h = 32;
      for (let x = 0; x < MW; x++) {
        h += (Math.random() - 0.5) * 2.6;
        h = clamp(h, 20, 40);
        const surf = Math.round(h);
        for (let y = 0; y < MH; y++) {
          let b = AIR;
          if (y >= MH - 2) b = BEDROCK;
          else if (y > surf + 5) b = STONE;
          else if (y > surf) b = DIRT;
          else if (y === surf) b = GRASS;
          blocks[idx(x, y)] = b;
        }
      }
      /* random stone boulders underground */
      for (let i = 0; i < 90; i++) {
        const x = Math.floor(rand(2, MW - 2));
        const y = Math.floor(rand(38, MH - 4));
        for (let dx = 0; dx < 3; dx++)
          for (let dy = 0; dy < 3; dy++)
            if (getBlock(x + dx, y + dy) === DIRT || getBlock(x + dx, y + dy) === STONE)
              setBlock(x + dx, y + dy, STONE);
      }
      /* trees */
      let x = 5;
      while (x < MW - 5) {
        x += Math.floor(rand(6, 13));
        const s = surfaceY(x);
        if (getBlock(x, s) !== GRASS) continue;
        const th = Math.floor(rand(4, 7));
        for (let i = 1; i <= th; i++) setBlock(x, s - i, WOOD);
        const top = s - th;
        for (let dx = -2; dx <= 2; dx++)
          for (let dy = -2; dy <= 1; dy++) {
            if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;
            if (getBlock(x + dx, top + dy) === AIR) setBlock(x + dx, top + dy, LEAVES);
          }
      }
      /* clear spawn area from trees / leaves, then spawn */
      for (let x = 9; x <= 13; x++) {
        const s = surfaceY(x);
        for (let y = 0; y < s; y++) setBlock(x, y, AIR);
      }
      spawnX = 10 * TW + 4;
      spawnY = (surfaceY(10) - 2) * TW;
      rebuildWorld();
    }

    function respawn() {
      px = spawnX; py = spawnY; vx = 0; vy = 0;
      hp = 100;
      fx.float(px, py - 10, "Возрождение", "#3ddc97");
    }

    function moveX() {
      const x0 = Math.floor(px / TW), x1 = Math.floor((px + PW - 1) / TW);
      const y0 = Math.floor(py / TW), y1 = Math.floor((py + PH - 1) / TW);
      if (vx > 0) {
        let limit = Infinity;
        for (let ty = y0; ty <= y1; ty++)
          for (let tx = x0; tx <= x1; tx++)
            if (solid(tx, ty)) limit = Math.min(limit, tx * TW - PW);
        if (limit < px + vx) { px = limit; vx = 0; }
        else px += vx;
      } else if (vx < 0) {
        let limit = -Infinity;
        for (let ty = y0; ty <= y1; ty++)
          for (let tx = x0; tx <= x1; tx++)
            if (solid(tx, ty)) limit = Math.max(limit, (tx + 1) * TW);
        if (limit > px + vx) { px = limit; vx = 0; }
        else px += vx;
      } else px += vx;
    }

    function moveY() {
      const impact = vy;
      const y0 = Math.floor(py / TW), y1 = Math.floor((py + PH - 1) / TW);
      const x0 = Math.floor(px / TW), x1 = Math.floor((px + PW - 1) / TW);
      onGround = false;
      if (vy > 0) {
        let limit = Infinity;
        for (let ty = y0; ty <= y1; ty++)
          for (let tx = x0; tx <= x1; tx++)
            if (solid(tx, ty)) limit = Math.min(limit, ty * TW - PH);
        if (limit < py + vy) {
          py = limit; vy = 0; onGround = true;
          if (impact > 980) {
            const dmg = Math.round((impact - 980) / 7);
            if (dmg > 0) {
              hp -= dmg;
              fx.float(px + PW / 2, py - 6, "−" + dmg + " HP", "#ff5c5c");
              fx.burst(px + PW / 2, py + PH, "#8d6e63", 10, 120);
              if (hp <= 0) respawn();
            }
          }
        } else py += vy;
      } else if (vy < 0) {
        let limit = -Infinity;
        for (let ty = y0; ty <= y1; ty++)
          for (let tx = x0; tx <= x1; tx++)
            if (solid(tx, ty)) limit = Math.max(limit, (ty + 1) * TW);
        if (limit > py + vy) { py = limit; vy = 0; }
        else py += vy;
      } else py += vy;
    }

    function mouseTile() {
      const wx = mouse.x + camDX;
      const wy = mouse.y + camDY;
      return { tx: Math.floor(wx / TW), ty: Math.floor(wy / TW), wx, wy };
    }

    function inReach(tx, ty) {
      const cx = tx * TW + TW / 2, cy = ty * TW + TW / 2;
      const dx = cx - (px + PW / 2), dy = cy - (py + PH / 2);
      return Math.hypot(dx, dy) <= 6.2 * TW;
    }

    const g = {
      id: "mine",
      title: "Mineplace",
      intro: "2D-песочница: копай блоки, строй башни и гуляй по миру.<br><b>A/D</b> — ходьба · <b>W / Space</b> — прыжок · <b>ЛКМ</b> — ломать · <b>ПКМ</b> — ставить · <b>1–6</b> — блок",
      tip: "",
      tips: [
        "Совет: ЛКМ ломает блок, ПКМ ставит выбранный.",
        "Совет: цифры 1–6 переключают блок в руке.",
        "Совет: падение с высоты отнимает HP.",
        "Совет: внизу мира лежит бедрок — его не сломать.",
      ],
      keysHint: '<kbd>A</kbd><kbd>D</kbd> ходьба <kbd>W</kbd> прыжок <kbd>ЛКМ</kbd> ломать <kbd>ПКМ</kbd> ставить <kbd>1-6</kbd> слот',
      hud: { score: "Добыто", wave: "Блок", best: "Рекорд", qte: false },

      reset() {
        generate();
        px = spawnX; py = spawnY; vx = 0; vy = 0;
        slot = 0; mined = 0; hp = 100; time = 0;
        best = getBest(BEST);
        fx.clear();
        acc = 0;
        camX = clamp(px + PW / 2 - W / 2, 0, MW * TW - W);
        camY = clamp(py + PH / 2 - H / 2, 0, MH * TW - H);
        camDX = Math.round(camX);
        camDY = Math.round(camY);
        sync();
      },
      sync() {
        setHud({
          hp: clamp(hp, 0, 100),
          score: mined,
          wave: NAMES[SLOTS[slot]],
          best,
        });
      },
      resyncBest() { best = getBest(BEST); }, // синхронизация с аккаунтом
      update(dt) {
        time += dt;

        /* fixed-timestep physics: motion stays smooth even if frames stutter */
        acc = Math.min(acc + dt, 0.1);
        const STEP = 1 / 120;
        let guard = 0;
        while (acc >= STEP && guard++ < 30) {
          const left = keys["a"] || keys["arrowleft"];
          const right = keys["d"] || keys["arrowright"];
          const jump = keys["w"] || keys["arrowup"] || keys[" "];
          vx = (right ? 165 : 0) - (left ? 165 : 0);
          if (jump && onGround) { vy = -545; onGround = false; }
          vy = Math.min(vy + 1600 * STEP, 1150);

          px += vx * STEP;
          moveX();
          py += vy * STEP;
          moveY();
          acc -= STEP;
        }

        /* slot hotkeys */
        presses.forEach((k) => {
          const n = parseInt(k, 10);
          if (n >= 1 && n <= 6) { slot = n - 1; sync(); }
        });

        /* dig / place */
        const m = mouseTile();
        const reachable = inReach(m.tx, m.ty);
        if (mouse.lclick && reachable) {
          const b = getBlock(m.tx, m.ty);
          if (b !== AIR && b !== BEDROCK) {
            setBlock(m.tx, m.ty, AIR);
            repaintTile(m.tx, m.ty);
            mined++;
            fx.burst(m.tx * TW + TW / 2, m.ty * TW + TW / 2, COLORS[b], 10, 140);
            if (mined > best) { best = mined; setBest(BEST, best); }
          } else if (b === BEDROCK) {
            fx.float(m.tx * TW + TW / 2, m.ty * TW, "не ломается", "#ffb84d");
          }
        }
        if (mouse.rclick && reachable && getBlock(m.tx, m.ty) === AIR) {
          const bx = m.tx * TW, by = m.ty * TW;
          const overlapsPlayer = px < bx + TW && px + PW > bx && py < by + TW && py + PH > by;
          if (!overlapsPlayer && m.ty < MH - 1) {
            setBlock(m.tx, m.ty, SLOTS[slot]);
            repaintTile(m.tx, m.ty);
            fx.burst(bx + TW / 2, by + TW / 2, COLORS[SLOTS[slot]], 6, 90);
          }
        }

        /* camera: eased follow + snapped to whole pixels (no tile shimmer) */
        const targetX = clamp(px + PW / 2 - W / 2, 0, MW * TW - W);
        const targetY = clamp(py + PH / 2 - H / 2, 0, MH * TW - H);
        const k = 1 - Math.exp(-14 * dt);
        camX += (targetX - camX) * k;
        camY += (targetY - camY) * k;
        camDX = Math.round(clamp(camX, 0, MW * TW - W));
        camDY = Math.round(clamp(camY, 0, MH * TW - H));

        fx.update(dt);
        sync();
        return null;
      },
      idle(dt) { fx.update(dt); },
      debug() { return { x: px, y: py, hp, mined, slots: slot }; },
      draw() {
        /* sky (gradient cached) */
        if (!skyGrad) {
          skyGrad = ctx.createLinearGradient(0, 0, 0, H);
          skyGrad.addColorStop(0, "#6ec1ff");
          skyGrad.addColorStop(1, "#cfeeff");
        }
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, W, H);

        /* sun */
        ctx.fillStyle = "rgba(255,241,150,0.95)";
        ctx.beginPath(); ctx.arc(W - 130, 80, 38, 0, Math.PI * 2); ctx.fill();

        /* clouds (parallax, no modulo jumps) */
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        const span = W + 400;
        for (let i = 0; i < 6; i++) {
          const cw = 90 + i * 24;
          let cx = (i * 340 - camX * 0.25 + time * (6 + i * 2)) % span;
          if (cx < 0) cx += span;
          cx -= 200;
          const cy = 50 + (i % 3) * 46;
          pathRoundRect(cx, cy, cw, 22, 11); ctx.fill();
          pathRoundRect(cx + 22, cy - 14, cw * 0.5, 24, 12); ctx.fill();
        }

        /* hills */
        ctx.fillStyle = "rgba(60,120,90,0.35)";
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 20) {
          const y = H - 150 - Math.sin((x + camX * 0.4) / 160) * 40;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.closePath(); ctx.fill();

        /* tiles: single blit of the prerendered world slice */
        ctx.drawImage(worldCv, camDX, camDY, W, H, 0, 0, W, H);

        /* highlight hovered tile */
        const m = mouseTile();
        if (m.tx >= 0 && m.tx < MW && m.ty >= 0 && m.ty < MH) {
          const reach = inReach(m.tx, m.ty);
          ctx.strokeStyle = reach ? "rgba(255,255,255,0.9)" : "rgba(255,92,92,0.8)";
          ctx.lineWidth = 2;
          ctx.strokeRect(m.tx * TW - camDX + 1, m.ty * TW - camDY + 1, TW - 2, TW - 2);
        }

        /* player (Steve-ish) */
        const sx = Math.round(px) - camDX, sy = Math.round(py) - camDY;
        ctx.fillStyle = "#3f51b5";                                   // body
        ctx.fillRect(sx + 2, sy + 11, PW - 4, 12);
        ctx.fillStyle = "#283593";                                   // legs
        ctx.fillRect(sx + 2, sy + 23, 5, 7);
        ctx.fillRect(sx + PW - 7, sy + 23, 5, 7);
        ctx.fillStyle = "#f0c8a0";                                   // head
        ctx.fillRect(sx, sy, PW, 12);
        ctx.fillStyle = "#3e2723";                                   // hair
        ctx.fillRect(sx, sy, PW, 3);
        ctx.fillStyle = "#263238";                                   // eyes
        ctx.fillRect(sx + 3, sy + 5, 3, 3);
        ctx.fillRect(sx + PW - 6, sy + 5, 3, 3);
        ctx.fillStyle = "#8d6e63";                                   // arms
        ctx.fillRect(sx - 3, sy + 11, 4, 11);
        ctx.fillRect(sx + PW - 1, sy + 11, 4, 11);

        /* fx (world space) */
        ctx.save();
        ctx.translate(-camDX, -camDY);
        fx.draw();
        ctx.restore();

        /* crosshair */
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mouse.x - 8, mouse.y); ctx.lineTo(mouse.x + 8, mouse.y);
        ctx.moveTo(mouse.x, mouse.y - 8); ctx.lineTo(mouse.x, mouse.y + 8);
        ctx.stroke();

        /* hotbar */
        const size = 46, gap = 8;
        const total = 6 * size + 5 * gap;
        const hx = (W - total) / 2, hy = H - size - 14;
        for (let i = 0; i < 6; i++) {
          const x = hx + i * (size + gap);
          ctx.fillStyle = i === slot ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.42)";
          pathRoundRect(x, hy, size, size, 8); ctx.fill();
          ctx.strokeStyle = i === slot ? "#ffffff" : "rgba(255,255,255,0.25)";
          ctx.lineWidth = i === slot ? 3 : 1.5;
          pathRoundRect(x, hy, size, size, 8); ctx.stroke();

          const bt = SLOTS[i];
          ctx.fillStyle = COLORS[bt];
          ctx.fillRect(x + 11, hy + 9, size - 22, size - 24);
          ctx.fillStyle = "rgba(0,0,0,0.18)";
          ctx.fillRect(x + 11, hy + size - 16, size - 22, 5);

          ctx.fillStyle = "#fff";
          ctx.font = '700 11px "JetBrains Mono", monospace';
          ctx.textAlign = "left";
          ctx.fillText(String(i + 1), x + 5, hy + 15);
        }
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.font = '700 13px "Manrope", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText(NAMES[SLOTS[slot]], W / 2, hy - 8);

        drawVignette();
      },
      over() { return null; },
    };

    function sync() { g.sync(); }
    return g;
  }

  /* =========================================================
     GAME 3 — Nebula Strike (6-гранник + ритм Q·E·R·F)
     ========================================================= */
  function createNebula() {
    const core = createCore();
    const BEST = "md_nebula_best";
    const QTE_KEYS = ["q", "e", "r", "f"];
    const QTE_LABEL = { q: "Q", e: "E", r: "R", f: "F" };
    const STEP_TIME = 1.6;

    let score = 0, kills = 0, killsNeeded = 10, spawnTimer = 0, best = 0;
    let boss = null, bossWave = 0, bossesKilled = 0;
    let qteStep = 0, qteTimer = STEP_TIME, qteZone = 0.5, qteFlash = 0;

    const marker = () => clamp(1 - qteTimer / STEP_TIME, 0, 1);

    function resetQte() { qteTimer = STEP_TIME; qteZone = rand(0.28, 0.72); }

    function spawnBoss() {
      const p = core.player;
      const a = rand(0, Math.PI * 2);
      /* field is cleared: only the hex stays alive until the duel ends */
      core.enemies.forEach((e) => core.fx.burst(e.x, e.y, e.color, 12, 180));
      core.enemies.length = 0;
      spawnTimer = 999;

      boss = {
        x: clamp(p.x + Math.cos(a) * 330, 50, W - 50),
        y: clamp(p.y + Math.sin(a) * 260, 70, H - 50),
        r: 38, hp: 100, maxHp: 100,
        mode: "windup", t: 0.22, vx: 0, vy: 0,
        dashCd: 2.2, rot: 0, hitFlash: 0,
      };
      bossWave = core.wave;
      qteStep = 0;
      resetQte();
      core.fx.float(W / 2, 130, "6-ГРАННИК ВЛЕТАЕТ!", "#ff4d8d");
      core.fx.float(W / 2, 168, "поле очищено — дуэль", "#00e0c6");
      core.fx.burst(boss.x, boss.y, "#ff4d8d", 26, 220);
    }

    function killBoss() {
      score += 500;
      bossesKilled++;
      core.fx.burst(boss.x, boss.y, "#00e0c6", 60, 340);
      core.fx.float(boss.x, boss.y, "NEBULA DOWN +500", "#00e0c6");
      core.shake = 10;
      boss = null;
      qteStep = 0;
      spawnTimer = 1.8; // breathing room before the swarm returns
      if (score > best) { best = score; setBest(BEST, best); }
    }

    function qteMiss() {
      const p = core.player;
      p.hp -= 10;
      core.shake = 8;
      core.fx.burst(p.x, p.y, "#ff5c5c", 16, 180);
      core.fx.float(p.x, p.y - 24, "РИТМ МИМО −10", "#ff5c5c");
      qteStep = 0;
      resetQte();
      return p.hp <= 0;
    }

    function qteHit() {
      boss.hp -= 25;
      boss.hitFlash = 0.16;
      qteFlash = 0.25;
      core.fx.burst(boss.x, boss.y, "#3ddc97", 18, 240);
      core.fx.float(boss.x, boss.y - boss.r - 14, "HIT! −25", "#00e0c6");
      qteStep++;
      if (boss.hp <= 0) killBoss();
      else resetQte();
    }

    /* returns true if player died */
    function qteFrame(dt) {
      if (!boss) return false;
      if (boss.mode !== "chase") return false; // QTE pauses during dash
      if (qteFlash > 0) qteFlash -= dt;
      qteTimer -= dt;
      if (qteTimer <= 0) return qteMiss();

      for (const k of presses) {
        if (!QTE_KEYS.includes(k)) continue;
        if (k !== QTE_KEYS[qteStep]) return qteMiss();
        if (Math.abs(marker() - qteZone) <= 0.1) { qteHit(); return false; }
        return qteMiss();
      }
      return false;
    }

    /* returns true if player died */
    function updateBoss(dt) {
      const p = core.player;
      boss.rot += dt * 1.4;
      if (boss.hitFlash > 0) boss.hitFlash -= dt;
      let died = false;

      if (boss.mode === "windup") {
        boss.t -= dt;
        if (boss.t <= 0) {
          const a = Math.atan2(p.y - boss.y, p.x - boss.x);
          boss.vx = Math.cos(a) * 980;
          boss.vy = Math.sin(a) * 980;
          boss.mode = "dash";
          boss.t = 0.32;
          core.fx.burst(boss.x, boss.y, "#ffb84d", 14, 200);
        }
      } else if (boss.mode === "dash") {
        boss.x += boss.vx * dt;
        boss.y += boss.vy * dt;
        boss.t -= dt;
        const d = Math.hypot(boss.x - p.x, boss.y - p.y);
        if (d < boss.r + p.r) {
          if (core.hurt(16)) died = true;
          boss.mode = "chase";
          boss.dashCd = 1.8;
        } else if (boss.t <= 0) {
          boss.mode = "chase";
          boss.dashCd = 1.9;
        }
      } else {
        const dx = p.x - boss.x, dy = p.y - boss.y;
        const d = Math.hypot(dx, dy) || 1;
        const sign = d > 210 ? 1 : -1;
        boss.x += (dx / d) * 92 * sign * dt;
        boss.y += (dy / d) * 92 * sign * dt;
        boss.dashCd -= dt;
        if (boss.dashCd <= 0) { boss.mode = "windup"; boss.t = 0.18; }
      }

      boss.x = clamp(boss.x, boss.r, W - boss.r);
      boss.y = clamp(boss.y, boss.r, H - boss.r);
      return died;
    }

    /* bullets bounce off the shield */
    function bossShield() {
      if (!boss) return;
      for (let i = core.bullets.length - 1; i >= 0; i--) {
        const b = core.bullets[i];
        if (Math.hypot(b.x - boss.x, b.y - boss.y) < boss.r + b.r) {
          core.bullets.splice(i, 1);
          boss.hitFlash = 0.08;
          core.fx.burst(b.x, b.y, "#7c5cff", 6, 130);
        }
      }
    }

    function drawBoss() {
      if (!boss) return;
      ctx.save();
      ctx.translate(boss.x, boss.y);
      ctx.rotate(boss.rot);

      ctx.shadowColor = "#ff4d8d";
      ctx.shadowBlur = 26;
      ctx.fillStyle = boss.hitFlash > 0 ? "#ffffff"
        : boss.mode === "windup" ? "#ffb84d"
        : "#ff4d8d";
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x = Math.cos(a) * boss.r, y = Math.sin(a) * boss.r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = "#180a1f";
      ctx.beginPath(); ctx.arc(0, 0, boss.r * 0.46, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = qteFlash > 0 ? "#00e0c6" : "#ffffff";
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      /* shield ring */
      ctx.save();
      ctx.strokeStyle = "rgba(124,92,255,0.75)";
      ctx.lineWidth = 2;
      ctx.setLineDash([9, 7]);
      ctx.lineDashOffset = -core.elapsed * 40;
      ctx.beginPath(); ctx.arc(boss.x, boss.y, boss.r + 12, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      /* hp bar */
      const bw = 96, bx = boss.x - bw / 2, by = boss.y - boss.r - 24;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(bx - 2, by - 2, bw + 4, 10);
      ctx.fillStyle = "#ff4d8d";
      ctx.fillRect(bx, by, bw * clamp(boss.hp / boss.maxHp, 0, 1), 6);
      ctx.fillStyle = "#fff";
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      ctx.fillText("HEX", boss.x, by - 6);

      /* dash telegraph */
      if (boss.mode === "windup") {
        ctx.strokeStyle = "rgba(255,184,77,0.9)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(boss.x, boss.y, boss.r + 20 - boss.t * 60, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function drawQte() {
      if (!boss) return;
      const size = 44, gap = 10;
      const total = 4 * size + 3 * gap;
      const x0 = W / 2 - total / 2;
      const y = 26;

      ctx.save();
      for (let i = 0; i < 4; i++) {
        const x = x0 + i * (size + gap);
        const done = i < qteStep;
        const active = i === qteStep;
        pathRoundRect(x, y, size, size, 10);
        ctx.fillStyle = done ? "rgba(0,224,198,0.28)"
          : active ? "rgba(124,92,255,0.5)"
          : "rgba(255,255,255,0.07)";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = done ? "#00e0c6" : active ? "#a58bff" : "rgba(255,255,255,0.18)";
        pathRoundRect(x, y, size, size, 10);
        ctx.stroke();

        ctx.fillStyle = done ? "#00e0c6" : active ? "#ffffff" : "rgba(255,255,255,0.4)";
        ctx.font = '800 22px "JetBrains Mono", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(QTE_LABEL[QTE_KEYS[i]], x + size / 2, y + size / 2 + 1);
        ctx.textBaseline = "alphabetic";
      }

      /* timing bar under the active key */
      if (boss.mode === "chase") {
        const bx = x0 + qteStep * (size + gap);
        const by = y + size + 7;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(bx, by, size, 8);
        ctx.fillStyle = "rgba(61,220,151,0.95)";
        ctx.fillRect(bx + (qteZone - 0.1) * size, by, size * 0.2, 8);
        const mx = bx + marker() * size;
        ctx.fillStyle = qteFlash > 0 ? "#00e0c6" : "#ffffff";
        ctx.fillRect(mx - 2, by - 4, 4, 16);
      } else {
        const bx = x0 + qteStep * (size + gap);
        const by = y + size + 7;
        ctx.fillStyle = "rgba(255,184,77,0.6)";
        ctx.fillRect(bx, by, size, 8);
      }
      ctx.restore();
    }

    const g = {
      id: "nebula",
      title: "Nebula Strike",
      intro: "Шутер с босс-механикой: <b>с 3-й волны</b> влетает 6-гранник и моментально рвётся к игроку.<br>В момент дуэли <b>все остальные враги исчезают и не спавнятся</b> — до победы над гранником или до твоего фейла.<br>Убить его можно только в ритм: лови маркер в зелёной зоне и жми <b>Q → E → R → F</b>.",
      tip: "",
      tips: [
        "Совет: с 3-й волны лови ритм Q→E→R→F.",
        "Совет: во время рывка гранника отходи в сторону.",
        "Совет: промах по ритму стоит 10 HP.",
        "Совет: 4 точных нажатия — и босс падает (+500).",
      ],
      keysHint: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> движение <kbd>ЛКМ</kbd> огонь <kbd>Q</kbd><kbd>E</kbd><kbd>R</kbd><kbd>F</kbd> ритм',
      hud: { score: "Счёт", wave: "Волна", best: "Рекорд", qte: true },

      reset() {
        core.reset();
        score = 0; kills = 0; killsNeeded = 10; spawnTimer = 1.2;
        best = getBest(BEST);
        boss = null; bossWave = 0; bossesKilled = 0;
        qteStep = 0; resetQte();
        sync();
      },
      sync() {
        setHud({
          hp: (core.player.hp / core.player.maxHp) * 100,
          score, wave: core.wave, best,
          qte: boss ? QTE_LABEL[QTE_KEYS[qteStep]] + " · " + qteStep + "/4" : "нет цели",
        });
      },
      resyncBest() { best = getBest(BEST); }, // синхронизация с аккаунтом
      update(dt) {
        core.tick(dt);
        core.control(dt);
        core.updateBullets(dt);

        let died = core.moveEnemies(dt);

        /* spawn timer — while the hex is alive nothing else spawns */
        if (!boss) {
          spawnTimer -= dt;
          if (spawnTimer <= 0) {
            core.spawnEnemy(core.wave);
            if (core.wave > 5 && Math.random() > 0.55) core.spawnEnemy(core.wave);
            spawnTimer = Math.max(0.3, 1.4 - core.wave * 0.09);
          }
        }

        /* boss */
        if (boss) {
          if (updateBoss(dt)) died = true;
          bossShield();
          if (qteFrame(dt)) died = true;
        }

        core.handleBullets((e) => {
          score += e.score;
          kills++;
          core.fx.float(e.x, e.y, "+" + e.score, e.color);
          if (Math.random() < 0.09 && core.player.hp < core.player.maxHp) {
            core.drops.push({ x: e.x, y: e.y, r: 9, life: 10, bob: rand(0, 6.3) });
          }
          if (kills >= killsNeeded) {
            core.wave++;
            kills = 0;
            killsNeeded = 8 + core.wave * 4;
            score += 100;
            core.fx.float(W / 2, H / 2 - 70, "WAVE " + core.wave + "  +100", "#00e0c6");
            if (core.wave >= 3 && !boss && core.wave !== bossWave) spawnBoss();
          }
          if (score > best) { best = score; setBest(BEST, best); }
        });

        core.updateDrops(dt);
        core.fx.update(dt);
        sync();
        return died ? "over" : null;
      },
      idle(dt) { core.idle(dt); },
      debug() {
        return { x: core.player.x, y: core.player.y, hp: core.player.hp, bullets: core.bullets.length, down: mouse.down };
      },
      draw() {
        core.drawWorld();
        drawBoss();
        core.drawPlayer();
        core.drawFx();
        drawQte();
      },
      over() {
        return {
          title: score >= best && score > 0 ? "Рекорд побит! 🏆" : "Игра окончена",
          html: `Счёт: <b>${score}</b> · волна <b>${core.wave}</b> · сбито боссов: <b>${bossesKilled}</b><br>Рекорд: <b>${best}</b>`,
        };
      },
    };

    function sync() { g.sync(); }
    return g;
  }

  /* =========================================================
     HUD + HUB
     ========================================================= */
  const hudCache = { hp: -1, score: null, wave: null, best: null, qte: null };
  function setHud(o) {
    if (o.hp !== undefined) {
      const v = Math.round(clamp(o.hp, 0, 100));
      if (hudCache.hp !== v) { hudCache.hp = v; hpBar.style.width = v + "%"; }
    }
    if (o.score !== undefined && hudCache.score !== o.score) {
      hudCache.score = o.score;
      scoreVal.textContent = o.score;
    }
    if (o.wave !== undefined && hudCache.wave !== o.wave) {
      hudCache.wave = o.wave;
      waveVal.textContent = o.wave;
    }
    if (o.best !== undefined && hudCache.best !== o.best) {
      hudCache.best = o.best;
      bestVal.textContent = o.best;
    }
    if (o.qte !== undefined && hudCache.qte !== o.qte) {
      hudCache.qte = o.qte;
      qteVal.textContent = o.qte;
    }
  }

  const GAMES = {
    arena: createArena(),
    mine: createMine(),
    nebula: createNebula(),
  };

  const hub = {
    id: "arena",
    game: GAMES.arena,
    state: "menu", // menu | play | pause | over

    showOverlay(title, html, btn) {
      overlayTitle.textContent = title;
      overlayText.innerHTML = html;
      startBtn.textContent = btn;
      overlay.classList.remove("is-hidden");
    },
    hideOverlay() { overlay.classList.add("is-hidden"); },

    debug() { return hub.game.debug ? hub.game.debug() : null; },

    select(id, keepPlaying) {
      if (!GAMES[id]) id = "arena";
      const wasPlaying = keepPlaying === undefined ? false : keepPlaying;
      hub.id = id;
      hub.game = GAMES[id];
      const g = hub.game;

      Array.from(picker.querySelectorAll(".gp")).forEach((b) =>
        b.classList.toggle("is-active", b.dataset.game === id)
      );

      scoreLbl.textContent = g.hud.score;
      waveLbl.textContent = g.hud.wave;
      bestLbl.textContent = g.hud.best;
      qteHud.hidden = !g.hud.qte;
      hudCache.hp = -1;
      hudCache.score = null;
      hudCache.wave = null;
      hudCache.best = null;
      hudCache.qte = null;
      gameTip.textContent = pick(g.tips);
      gameKeys.innerHTML = g.keysHint;

      g.reset();
      hub.state = "menu";
      hub.showOverlay(g.title, g.intro, "Играть");
      if (wasPlaying) hub.begin();
    },

    begin() {
      hub.game.reset();
      hub.state = "play";
      hub.hideOverlay();
      gameTip.textContent = pick(hub.game.tips);
    },

    togglePause() {
      if (hub.state === "play") {
        hub.state = "pause";
        hub.showOverlay("Пауза", "Отдыхаем? Противники и боссы тоже остановились.<br><b>P</b> / <b>Esc</b> — продолжить", "Продолжить");
        startBtn.textContent = "Продолжить";
      } else if (hub.state === "pause") {
        hub.state = "play";
        hub.hideOverlay();
      }
    },

    over() {
      hub.state = "over";
      const info = hub.game.over();
      if (info) hub.showOverlay(info.title, info.html, "Играть снова");
    },
  };

  startBtn.addEventListener("click", () => {
    if (hub.state === "pause") hub.togglePause();
    else hub.begin();
  });

  picker.addEventListener("click", (e) => {
    const btn = e.target.closest(".gp");
    if (!btn) return;
    hub.select(btn.dataset.game, hub.state === "play");
  });

  /* ---------- main loop (rAF + timer fallback) ----------
     Browsers fully pause requestAnimationFrame in hidden/occluded
     windows, which froze the game ("WASD не двигает"). Timers keep
     running there, so they take over whenever rAF goes silent. */
  let last = performance.now();

  function step(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    if (hub.state === "play") {
      const res = hub.game.update(dt);
      if (res === "over") hub.over();
    } else {
      hub.game.idle(dt);
    }
    hub.game.draw();

    presses.length = 0;
    mouse.lclick = false;
    mouse.rclick = false;
  }

  function loop(now) {
    step(now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* fallback driver: only steps when rAF hasn't ticked recently */
  setInterval(() => {
    const now = performance.now();
    if (now - last > 60) step(now);
  }, 16);

  /* смена аккаунта (войти/выйти) → обновляем рекорд в HUD */
  document.addEventListener("md-auth", () => {
    const g = GAMES[hub.id];
    if (!g) return;
    if (g.resyncBest) g.resyncBest();
    if (g.sync) g.sync();
  });

  hub.select("arena");
  window.MadiumGames = hub; // debug/testing hook
})();
