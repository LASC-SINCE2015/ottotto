// 効果音（ファイルを使わず、Web Audio で音を合成する）
(function () {
  'use strict';

  let ac = null;
  let muted = false;

  try {
    muted = localStorage.getItem(window.OTTO_CONFIG.STORAGE_MUTE) === '1';
  } catch (e) {
    /* 保存できない環境では無視する */
  }

  // ブラウザの制約で、ユーザーの操作のあとでないと音を出せないため、最初のタップで初期化する
  function unlock() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
  }

  function tone(freq, endFreq, dur, type, vol, delay) {
    if (!ac || muted) return;
    const t0 = ac.currentTime + (delay || 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  window.Sound = {
    unlock,
    isMuted: () => muted,
    setMuted(v) {
      muted = v;
      try {
        localStorage.setItem(window.OTTO_CONFIG.STORAGE_MUTE, v ? '1' : '0');
      } catch (e) {
        /* 無視 */
      }
    },
    // 落とした
    drop() {
      tone(520, 380, 0.12, 'triangle', 0.08);
    },
    // ぷにっと着地
    pop(strength) {
      const k = Math.max(0.2, Math.min(1, strength));
      tone(300 + 200 * k, 120, 0.16, 'sine', 0.25 * k);
    },
    // ピタッ・ギリギリ・レア
    chime(level) {
      const base = 880 * Math.pow(1.122, Math.min(6, level || 0));
      tone(base, base, 0.12, 'triangle', 0.12);
      tone(base * 1.5, base * 1.5, 0.22, 'triangle', 0.12, 0.08);
    },
    // おっとっと（落ちた）
    oops() {
      tone(600, 140, 0.45, 'sawtooth', 0.06);
    },
    gameOver() {
      tone(440, 220, 0.3, 'triangle', 0.12);
      tone(330, 110, 0.6, 'triangle', 0.12, 0.25);
    },
  };
})();
