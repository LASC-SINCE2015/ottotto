// ゲーム本体（進行・物理との橋渡し・描画）。
// 座標は「ワールド単位」（横幅 WORLD_W）。物理エンジンにはメートルに直して渡す。
(function () {
  'use strict';

  const CFG = window.OTTO_CONFIG;
  const W = CFG.WORLD_W;
  const CW = CFG.CHARA_W;
  const CH = CFG.CHARA_H;
  const GROUND = 0; // 土台の上面の y
  const PX = 60; // 1m = 60 ワールド単位
  const STEP = 1 / 60;
  const LOST_Y = GROUND + 260; // これより下に落ちたら「落とした」
  const FONT = '"Yomogi", "Hiragino Maru Gothic ProN", "Meiryo", sans-serif';

  let canvas;
  let ctx;
  let dpr = 1;
  let scale = 1;
  let viewH = 600;
  let world;
  let pedestal;

  let pieces = [];
  let holding = null;
  let aimX = W / 2;
  let holdX = W / 2;
  let pointerDown = false;
  let viewTop = GROUND - 500;
  let acc = 0;
  let lastT = 0;
  let time = 0;
  let shake = 0;
  let popups = [];
  let particles = [];
  let rings = [];

  const G = {
    running: false,
    over: false,
    bonus: 0,
    maxH: 0,
    lives: CFG.LIVES,
    combo: 0,
    waitUntil: 0,
    lastDropped: null,
    dropCount: 0,
  };

  let hooks = { onHud() {}, onGameOver() {} };

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const normAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const clampX = (x) => clamp(x, CW / 2 + 6, W - CW / 2 - 6);

  // ---------- 初期化 ----------
  function init(cv, h) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    hooks = Object.assign(hooks, h);
    world = new window.Physics.World(window.Physics.vec(0, 14), 12);
    world.onImpact = onImpact;
    resetWorld();
    resize();
    window.addEventListener('resize', resize);
    bindInput();
    requestAnimationFrame(frame);
  }

  function resetWorld() {
    world.clear();
    pedestal = new window.Physics.Body(CFG.PEDESTAL_W / PX, CFG.PEDESTAL_H / PX, 0);
    pedestal.pos = window.Physics.vec(W / 2 / PX, (GROUND + CFG.PEDESTAL_H / 2) / PX);
    pedestal.friction = 0.9;
    world.add(pedestal);
    pieces = [];
    popups = [];
    particles = [];
    rings = [];
  }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;
    scale = r.width / W;
    viewH = r.height / scale;
    viewTop = cameraTarget();
  }

  // ---------- 入力 ----------
  function toWorldX(e) {
    const r = canvas.getBoundingClientRect();
    return (e.clientX - r.left) / scale;
  }

  function bindInput() {
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      window.Sound.unlock();
      pointerDown = true;
      aimX = toWorldX(e);
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {
        /* 無視 */
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' || pointerDown) aimX = toWorldX(e);
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!pointerDown) return;
      pointerDown = false;
      aimX = toWorldX(e);
      drop();
    });
    canvas.addEventListener('pointercancel', () => {
      pointerDown = false;
    });
    window.addEventListener('keydown', (e) => {
      if (!G.running) return;
      if (e.key === 'ArrowLeft') aimX = clampX(holdX - 12);
      else if (e.key === 'ArrowRight') aimX = clampX(holdX + 12);
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        drop();
      }
    });
  }

  // ---------- 進行 ----------
  function start() {
    resetWorld();
    G.running = true;
    G.over = false;
    G.bonus = 0;
    G.maxH = 0;
    G.lives = CFG.LIVES;
    G.combo = 0;
    G.waitUntil = time + 0.3;
    G.lastDropped = null;
    G.dropCount = 0;
    holding = null;
    aimX = holdX = W / 2;
    viewTop = cameraTarget();
    hud();
  }

  function score() {
    return Math.round(heightCm(G.maxH) * CFG.POINT_PER_CM) + G.bonus;
  }

  function heightCm(h) {
    return (h / CH) * CFG.CHARA_CM;
  }

  function hud() {
    hooks.onHud({
      score: score(),
      heightCm: heightCm(G.maxH),
      lives: G.lives,
      maxLives: CFG.LIVES,
    });
  }

  function newHolding() {
    let face = 'normal';
    let fill = '#ffffff';
    let rare = false;
    if (Math.random() < CFG.RARE_RATE) {
      const list = ['kira', 'nemui', 'nikkori'];
      face = list[Math.floor(Math.random() * list.length)];
      rare = true;
      if (face === 'kira') fill = '#fff1b8';
      if (face === 'nemui') fill = '#e9f3ff';
      if (face === 'nikkori') fill = '#ffeef2';
    }
    const tiltRate = Math.min(CFG.TILT_RATE_MAX, CFG.TILT_RATE_BASE + G.dropCount * 0.012);
    let angle = 0;
    if (Math.random() < tiltRate) {
      angle = (Math.random() < 0.5 ? -1 : 1) * rand(0.12, 0.34);
    }
    holding = { face, fill, rare, angle, appear: 0 };
  }

  function drop() {
    if (!holding || !G.running || time < G.waitUntil || holding.appear < 0.25) return;
    holdX = clampX(aimX);
    const body = new window.Physics.Body(CW / PX, CH / PX, 1);
    body.friction = 0.7;
    body.pos = window.Physics.vec(holdX / PX, spawnY() / PX);
    body.rot = holding.angle;
    body.vel = window.Physics.vec(0, 1.2);
    const p = {
      body,
      face: holding.face,
      fill: holding.fill,
      rare: holding.rare,
      squash: 0,
      squashV: 0,
      panic: 0,
      landed: false,
      settled: false,
      still: 0,
      age: 0,
      glow: 0,
      blink: 0,
      blinkWait: rand(1.5, 4),
      giri: null,
      lost: false,
    };
    body.userData = p;
    world.add(body);
    pieces.push(p);
    G.lastDropped = p;
    G.dropCount++;
    G.waitUntil = time + CFG.MIN_WAIT;
    holding = null;
    window.Sound.drop();
  }

  function onImpact(a, b, speed) {
    // speed は m/s
    for (const body of [a, b]) {
      const p = body.userData;
      if (!p) continue;
      if (speed > 0.4) {
        p.squashV += Math.min(speed, 9) * 0.45;
      }
      if (!p.landed) {
        p.landed = true;
        window.Sound.pop(speed / 6);
      } else if (speed > 2.5) {
        window.Sound.pop(speed / 12);
      }
    }
  }

  // タワーのいちばん上（ワールド y）。止まっているキャラだけを見る
  function towerTop() {
    let top = GROUND;
    for (const p of pieces) {
      if (p.lost || !p.landed) continue;
      const b = p.body;
      if (Math.hypot(b.vel.x, b.vel.y) > 0.8) continue;
      top = Math.min(top, topOf(b));
    }
    return top;
  }

  function topOf(b) {
    const c = Math.abs(Math.cos(b.rot));
    const s = Math.abs(Math.sin(b.rot));
    const halfH = (b.w * s + b.h * c) / 2;
    return (b.pos.y - halfH) * PX;
  }

  function spawnY() {
    return towerTop() - CFG.SPAWN_GAP;
  }

  function cameraTarget() {
    const followTower = spawnY() - 135;
    const groundView = GROUND - (viewH - 170);
    return Math.min(followTower, groundView);
  }

  // 下で支えている相手を探す
  function supportOf(p) {
    const b = p.body;
    let best = null;
    let bestDy = Infinity;
    for (const q of pieces) {
      if (q === p || q.lost) continue;
      const dy = (q.body.pos.y - b.pos.y) * PX;
      const dx = Math.abs(q.body.pos.x - b.pos.x) * PX;
      if (dy > CH * 0.5 && dy < CH * 1.4 && dx < CW * 0.98 && dy < bestDy) {
        best = q;
        bestDy = dy;
      }
    }
    if (best) return { x: best.body.pos.x * PX, rot: best.body.rot };
    const y = b.pos.y * PX;
    if (y > GROUND - CH * 0.9 && Math.abs(b.pos.x * PX - W / 2) < CFG.PEDESTAL_W / 2 + CW / 2) {
      return { x: W / 2, rot: 0 };
    }
    return null;
  }

  function onSettle(p) {
    const b = p.body;
    const x = b.pos.x * PX;
    const y = b.pos.y * PX;
    const sup = supportOf(p);
    const tilt = Math.abs(normAngle(b.rot));

    if (p.rare) {
      addBonus(CFG.RARE_POINT, 'レア！', x, y - CH * 0.9, '#e0a800');
      p.glow = 1;
      burst(x, y, '#ffcf33');
      window.Sound.chime(2);
    }
    if (!sup) return;
    const dx = x - sup.x;
    const supTilt = Math.abs(normAngle(sup.rot));

    if (Math.abs(dx) < CFG.PITA_DX && tilt < CFG.PITA_TILT && supTilt < CFG.PITA_TILT) {
      G.combo++;
      const pts = CFG.PITA_POINT * G.combo;
      const label = G.combo > 1 ? `ピタッ！ ×${G.combo}` : 'ピタッ！';
      addBonus(pts, label, x, y - CH * 0.9, '#ff7a00');
      p.glow = 1;
      rings.push({ x, y, t: 0 });
      burst(x, y, '#ffd84a');
      window.Sound.chime(G.combo);
    } else {
      G.combo = 0;
    }

    if (Math.abs(dx) > CW * CFG.GIRI_DX_RATE || tilt > CFG.GIRI_TILT) {
      p.giri = { t: time, x, y };
      popup('あぶな…', x, y - CH * 0.8, '#3d7bd9', 18);
    }
  }

  function addBonus(pts, label, x, y, color) {
    G.bonus += pts;
    popup(`${label} +${pts}`, x, y, color, 22);
    hud();
  }

  function popup(text, x, y, color, size) {
    popups.push({ text, x: clamp(x, 70, W - 70), y, t: 0, life: 1.4, color, size });
  }

  function burst(x, y, color) {
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(60, 170);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: rand(0.4, 0.8), t: 0, color });
    }
  }

  function lose(p) {
    p.lost = true;
    world.remove(p.body);
    pieces.splice(pieces.indexOf(p), 1);
    G.combo = 0;
    if (!G.running) return;
    G.lives--;
    shake = 0.35;
    popup('おっとっと！', clamp(p.body.pos.x * PX, 80, W - 80), viewTop + viewH - 140, '#e5484d', 26);
    window.Sound.oops();
    hud();
    if (G.lives <= 0) gameOver();
  }

  function gameOver() {
    G.running = false;
    G.over = true;
    holding = null;
    window.Sound.gameOver();
    setTimeout(() => {
      hooks.onGameOver({ score: score(), heightCm: heightCm(G.maxH), count: G.dropCount });
    }, 1100);
  }

  // ---------- 毎フレームの更新 ----------
  function frame(ts) {
    const dt = Math.min(0.1, (ts - lastT) / 1000 || 0);
    lastT = ts;
    time += dt;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 6) {
      world.step(STEP);
      acc -= STEP;
      n++;
    }
    if (n >= 6) acc = 0;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function update(dt) {
    let danger = 0;

    for (const p of [...pieces]) {
      const b = p.body;
      p.age += dt;

      // ぷにっ（ばね）
      p.squashV += (-340 * p.squash - 13 * p.squashV) * dt;
      p.squash = clamp(p.squash + p.squashV * dt, -0.22, 0.3);

      // まばたき
      p.blinkWait -= dt;
      if (p.blinkWait < 0) {
        p.blink = 0.12;
        p.blinkWait = rand(2, 5);
      }
      p.blink = Math.max(0, p.blink - dt);
      p.glow = Math.max(0, p.glow - dt * 0.9);

      // 止まったかどうか
      const sp = Math.hypot(b.vel.x, b.vel.y);
      if (p.landed && sp < 0.08 && Math.abs(b.angVel) < 0.08) p.still += dt;
      else p.still = 0;
      if (!p.settled && p.still > 0.35) {
        p.settled = true;
        onSettle(p);
      }

      // 焦り具合
      const tilt = Math.abs(normAngle(b.rot));
      let target = clamp((tilt - 0.16) / 0.35, 0, 1);
      target += clamp(Math.abs(b.angVel) * 0.9, 0, 1);
      if (p.landed && sp > 1.5) target += 0.7;
      if (p.giri && !p.giri.done) target = Math.max(target, 0.6);
      p.panic += (Math.min(1, target) - p.panic) * Math.min(1, dt * 6);
      if (p.landed) danger = Math.max(danger, p.panic);

      // ギリギリ賞
      if (p.giri && !p.giri.done && time - p.giri.t > CFG.GIRI_HOLD) {
        p.giri.done = true;
        const d = Math.hypot(b.pos.x * PX - p.giri.x, b.pos.y * PX - p.giri.y);
        if (d < 14 && G.running) {
          addBonus(CFG.GIRI_POINT, 'ギリギリ賞！', p.giri.x, p.giri.y - CH * 0.9, '#2f9e44');
          p.glow = 1;
          burst(p.giri.x, p.giri.y, '#8ce99a');
          window.Sound.chime(3);
        }
      }

      // 落ちた
      const x = b.pos.x * PX;
      if (b.pos.y * PX > LOST_Y || x < -200 || x > W + 200) lose(p);
    }

    // 最高到達点
    if (G.running) {
      const h = GROUND - towerTop();
      if (h > G.maxH + 0.5) {
        G.maxH = h;
        hud();
      }
    }

    // 次のキャラ
    const last = G.lastDropped;
    if (
      !holding &&
      G.running &&
      time >= G.waitUntil &&
      (!last || last.settled || last.lost || last.age > CFG.MAX_WAIT)
    ) {
      newHolding();
    }
    if (holding) {
      holding.appear = Math.min(1, holding.appear + dt * 3);
      holding.panic = danger > 0.55 ? 0.8 : 0;
      holdX += (clampX(aimX) - holdX) * Math.min(1, dt * 16);
    }

    // カメラ
    viewTop += (cameraTarget() - viewTop) * Math.min(1, dt * 2.5);
    shake = Math.max(0, shake - dt);

    // 演出
    for (const pp of popups) {
      pp.t += dt;
      pp.y -= 30 * dt;
    }
    popups = popups.filter((pp) => pp.t < pp.life);
    for (const q of particles) {
      q.t += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vy += 300 * dt;
    }
    particles = particles.filter((q) => q.t < q.life);
    for (const r of rings) r.t += dt;
    rings = rings.filter((r) => r.t < 0.5);
  }

  // ---------- 描画 ----------
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const k = dpr * scale;
    const sx = shake > 0 ? rand(-4, 4) * shake : 0;
    const sy = shake > 0 ? rand(-4, 4) * shake : 0;
    ctx.setTransform(k, 0, 0, k, sx * k, (-viewTop + sy) * k);

    drawPaper();
    drawRuler();
    drawPedestal();

    // 落とす位置のガイド
    if (holding) {
      const y0 = spawnY() + CH / 2;
      ctx.save();
      ctx.strokeStyle = 'rgba(80, 120, 200, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.moveTo(holdX, y0 + 6);
      ctx.lineTo(holdX, Math.min(GROUND, viewTop + viewH));
      ctx.stroke();
      ctx.restore();
    }

    for (const p of pieces) {
      const b = p.body;
      drawChara(b.pos.x * PX, b.pos.y * PX, b.rot, p, p.squash);
    }

    if (holding) {
      const bob = Math.sin(time * 3) * 3;
      const a = holding.appear;
      ctx.save();
      ctx.globalAlpha = a;
      drawChara(holdX, spawnY() + bob - (1 - a) * 30, holding.angle + Math.sin(time * 2.2) * 0.03, holding, 0);
      ctx.restore();
    }

    for (const r of rings) {
      ctx.save();
      ctx.strokeStyle = `rgba(255, 200, 40, ${1 - r.t / 0.5})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 20 + r.t * 160, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const q of particles) {
      ctx.save();
      ctx.globalAlpha = 1 - q.t / q.life;
      ctx.strokeStyle = q.color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(q.x - q.vx * 0.05, q.y - q.vy * 0.05);
      ctx.stroke();
      ctx.restore();
    }

    for (const pp of popups) {
      const a = 1 - Math.max(0, (pp.t - pp.life * 0.6) / (pp.life * 0.4));
      const pop = 1 + Math.max(0, 0.3 - pp.t) * 1.5;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(pp.x, pp.y);
      ctx.scale(pop, pop);
      ctx.font = `bold ${pp.size}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(pp.text, 0, 0);
      ctx.fillStyle = pp.color;
      ctx.fillText(pp.text, 0, 0);
      ctx.restore();
    }
  }

  function drawChara(x, y, rot, p, squash) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (squash) {
      // 足もとを支点に、横に広がって縦につぶれる
      ctx.translate(0, CH / 2);
      ctx.scale(1 + squash * 0.7, 1 - squash);
      ctx.translate(0, -CH / 2);
    }
    window.Chara.draw(ctx, {
      w: CW,
      face: p.face,
      panic: p.panic || 0,
      fill: p.fill,
      glow: p.glow || 0,
      blink: p.blink > 0,
      t: time + (p.body ? p.body.id * 0.37 : 0),
    });
    ctx.restore();
  }

  // 方眼紙
  function drawPaper() {
    const top = viewTop - 20;
    const bottom = viewTop + viewH + 20;
    ctx.fillStyle = '#fbfaf4';
    ctx.fillRect(-20, top, W + 40, bottom - top);
    const minor = 12;
    const start = Math.floor(top / minor) * minor;
    ctx.lineWidth = 0.6;
    for (let y = start; y < bottom; y += minor) {
      const major = Math.round(y / minor) % 5 === 0;
      ctx.strokeStyle = major ? 'rgba(90, 150, 200, 0.28)' : 'rgba(90, 150, 200, 0.12)';
      ctx.beginPath();
      ctx.moveTo(-20, y);
      ctx.lineTo(W + 20, y);
      ctx.stroke();
    }
    for (let x = 0; x <= W; x += minor) {
      const major = Math.round(x / minor) % 5 === 0;
      ctx.strokeStyle = major ? 'rgba(90, 150, 200, 0.28)' : 'rgba(90, 150, 200, 0.12)';
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }
  }

  // 高さのものさし と 最高記録の線
  function drawRuler() {
    ctx.save();
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = 'rgba(60, 90, 130, 0.7)';
    ctx.strokeStyle = 'rgba(60, 90, 130, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.textBaseline = 'middle';
    for (let i = 1; i < 400; i++) {
      const y = GROUND - i * CH;
      if (y < viewTop - 20) break;
      if (y > viewTop + viewH + 20) continue;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(10, y);
      ctx.stroke();
      ctx.fillText(`${i * CFG.CHARA_CM}cm`, 13, y);
    }
    if (G.maxH > 0) {
      const y = GROUND - G.maxH;
      ctx.strokeStyle = 'rgba(229, 72, 77, 0.6)';
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(229, 72, 77, 0.85)';
      ctx.textAlign = 'right';
      ctx.fillText(`さいこう ${heightCm(G.maxH).toFixed(1)}cm`, W - 6, y - 9);
    }
    ctx.restore();
  }

  // 土台（手描き風の台）
  function drawPedestal() {
    const w = CFG.PEDESTAL_W;
    const h = CFG.PEDESTAL_H;
    const x0 = W / 2 - w / 2;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, GROUND + 0.5);
    ctx.lineTo(x0 + w, GROUND - 0.5);
    ctx.lineTo(x0 + w - 1, GROUND + h);
    ctx.lineTo(x0 + 1, GROUND + h + 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 斜線
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(43, 43, 43, 0.25)';
    ctx.lineWidth = 1.2;
    for (let i = -h; i < w; i += 9) {
      ctx.beginPath();
      ctx.moveTo(x0 + i, GROUND + h);
      ctx.lineTo(x0 + i + h, GROUND);
      ctx.stroke();
    }
    ctx.restore();
    // 脚
    ctx.beginPath();
    ctx.moveTo(x0 + 18, GROUND + h);
    ctx.lineTo(x0 + 10, GROUND + h + 120);
    ctx.moveTo(x0 + w - 18, GROUND + h);
    ctx.lineTo(x0 + w - 10, GROUND + h + 120);
    ctx.stroke();
    ctx.restore();
  }

  window.OttoGame = { init, start, isRunning: () => G.running };
})();
