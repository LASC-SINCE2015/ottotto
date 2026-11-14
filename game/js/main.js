// 画面（タイトル・HUD・ゲームオーバー）の切り替えと、ゲーム本体のつなぎ込み。
(function () {
  'use strict';

  const CFG = window.OTTO_CONFIG;
  const $ = (id) => document.getElementById(id);

  let best = 0;
  let lastResult = null;
  try {
    best = Number(localStorage.getItem(CFG.STORAGE_BEST)) || 0;
  } catch (e) {
    best = 0;
  }

  function saveBest(v) {
    best = v;
    try {
      localStorage.setItem(CFG.STORAGE_BEST, String(v));
    } catch (e) {
      /* 保存できない環境では、その回だけの記録にする */
    }
  }

  // ---- ライフの表示（小さなキャラ） ----
  const lifeIcons = [];
  function buildLives() {
    const box = $('hud-lives');
    box.innerHTML = '';
    lifeIcons.length = 0;
    for (let i = 0; i < CFG.LIVES; i++) {
      const c = document.createElement('canvas');
      c.width = 60;
      c.height = 60;
      const x = c.getContext('2d');
      x.translate(30, 34);
      window.Chara.draw(x, { w: 30, face: 'normal' });
      box.appendChild(c);
      lifeIcons.push(c);
    }
  }

  function onHud(s) {
    $('hud-score').textContent = s.score.toLocaleString();
    $('hud-height').textContent = s.heightCm.toFixed(1);
    lifeIcons.forEach((c, i) => c.classList.toggle('gone', i >= s.lives));
  }

  function onGameOver(r) {
    lastResult = r;
    const isNew = r.score > best;
    if (isNew) saveBest(r.score);
    $('over-score').textContent = r.score.toLocaleString();
    $('over-height').textContent = r.heightCm.toFixed(1);
    $('over-count').textContent = r.count;
    $('over-best').textContent = best.toLocaleString();
    $('over-new').classList.toggle('hidden', !isNew);
    $('hud').classList.add('hidden');
    $('over').classList.remove('hidden');
  }

  function startGame() {
    window.Sound.unlock();
    $('title').classList.add('hidden');
    $('over').classList.add('hidden');
    $('hud').classList.remove('hidden');
    window.OttoGame.start();
  }

  function showTitle() {
    $('over').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('title-best').textContent = best.toLocaleString();
    $('title').classList.remove('hidden');
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.add('hidden'), 1800);
  }

  async function share() {
    if (!lastResult) return;
    const text = `おっとっとタワーで ${lastResult.score.toLocaleString()} てん！（たかさ ${lastResult.heightCm.toFixed(1)}cm）`;
    const url = location.href.split('?')[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: 'おっとっとタワー', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast('結果をコピーしました');
    } catch (e) {
      // 共有をキャンセルしたときなど
    }
  }

  function updateSoundBtn() {
    $('btn-sound').classList.toggle('muted', window.Sound.isMuted());
  }

  // ---- タイトルのキャラ（ぴょこぴょこ跳ねる） ----
  function animateTitle() {
    const c = $('title-chara');
    const x = c.getContext('2d');
    let t = 0;
    let last = 0;
    function loop(ts) {
      const dt = Math.min(0.05, (ts - last) / 1000 || 0);
      last = ts;
      t += dt;
      if (!$('title').classList.contains('hidden')) {
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.clearRect(0, 0, c.width, c.height);
        const phase = t % 1.2;
        const jump = phase < 0.6 ? Math.sin((phase / 0.6) * Math.PI) * 26 : 0;
        const land = phase >= 0.6 && phase < 0.9 ? Math.sin(((phase - 0.6) / 0.3) * Math.PI) * 0.18 : 0;
        x.translate(100, 160 - jump);
        x.scale(1 + land * 0.7, 1 - land);
        x.translate(0, -56);
        window.Chara.draw(x, { w: 100, face: 'normal', t, blink: t % 3.2 < 0.12 });
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  // ---- 初期化 ----
  $('version').textContent = CFG.VERSION;
  buildLives();
  window.OttoGame.init($('game'), { onHud, onGameOver });
  $('btn-start').addEventListener('click', startGame);
  $('btn-retry').addEventListener('click', startGame);
  $('btn-title').addEventListener('click', showTitle);
  $('btn-share').addEventListener('click', share);
  $('btn-sound').addEventListener('click', () => {
    window.Sound.unlock();
    window.Sound.setMuted(!window.Sound.isMuted());
    updateSoundBtn();
  });
  updateSoundBtn();
  showTitle();
  animateTitle();
})();
