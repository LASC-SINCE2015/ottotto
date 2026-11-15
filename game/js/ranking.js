// みんなのランキング（Google Apps Script の受け口とのやりとり）。window.Ranking
// 受け口の URL は config.js の RANKING_URL。空ならランキングは使わない。
(function () {
  'use strict';

  const CFG = window.OTTO_CONFIG;
  const URL_ = CFG.RANKING_URL || '';
  const TIMEOUT_MS = 15000;

  function load(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function save(key, v) {
    try {
      localStorage.setItem(key, v);
    } catch (e) {
      /* 保存できない環境では、その回だけの値にする */
    }
  }

  // 端末ごとのプレイヤー ID（ランダム）。ランキングで 1 人 1 件にまとめるのに使う
  function playerId() {
    let id = load(CFG.STORAGE_PLAYER);
    if (!id || !/^[a-z0-9]{8,32}$/.test(id)) {
      id = '';
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      const rnd = new Uint8Array(20);
      (window.crypto || window.msCrypto).getRandomValues(rnd);
      rnd.forEach((b) => (id += chars[b % chars.length]));
      save(CFG.STORAGE_PLAYER, id);
    }
    return id;
  }

  function getName() {
    return load(CFG.STORAGE_NAME) || '';
  }

  function cleanName(v) {
    const s = String(v || '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim();
    return Array.from(s).slice(0, CFG.NAME_MAX).join('');
  }

  function withTimeout(promise) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ]);
  }

  async function post(body) {
    // text/plain にすると、ブラウザの事前確認（preflight）なしで送れる
    const res = await withTimeout(
      fetch(URL_, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      })
    );
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'error');
    return data;
  }

  window.Ranking = {
    enabled: !!URL_,
    getName,
    cleanName,

    // ランキング上位 n 件と、自分の順位を取得する
    async fetchTop(n) {
      const params = new URLSearchParams({ n: String(n || 10), me: playerId() });
      const res = await withTimeout(fetch(`${URL_}?${params.toString()}`));
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'error');
      return data;
    },

    // スコアを送る。まだ送っていない自己ベストのときだけ送る（同じ点を何度も送らない）
    needsSubmit(score) {
      return score > (Number(load(CFG.STORAGE_SENT)) || 0);
    },

    async submit(r) {
      const data = await post({
        action: 'submit',
        playerId: playerId(),
        name: getName(),
        score: r.score,
        heightCm: r.heightCm,
        count: r.count,
      });
      save(CFG.STORAGE_SENT, String(r.score));
      return data;
    },

    // 名前を変える。すでにランキングに載っていれば、受け口の名前も変える
    async setName(name) {
      name = cleanName(name);
      if (!name) return false;
      save(CFG.STORAGE_NAME, name);
      if (Number(load(CFG.STORAGE_SENT)) > 0) {
        await post({ action: 'rename', playerId: playerId(), name });
      }
      return true;
    },
  };
})();
