/**
 * おっとっとタワー：みんなのランキングの受け口（Google Apps Script）
 *
 * スプレッドシートに紐づけて「ウェブアプリ」としてデプロイする。手順は gas/README.md を参照。
 *
 * - GET  ?n=10               … ランキング（1 人 1 件・ベストスコア順）を JSON で返す
 * - POST {action:'submit', …} … スコアを 1 行追加し、そのプレイヤーの順位を返す
 * - POST {action:'rename', …} … プレイヤーの名前を変える
 *
 * ゲームからは Content-Type: text/plain で JSON を送る（ブラウザの事前確認を避けるため）。
 */

const SHEET_SCORES = 'scores'; // スコアの記録（1 回の登録 = 1 行）
const SHEET_PLAYERS = 'players'; // プレイヤー ID と名前の対応
const NAME_MAX = 10; // 名前の最大文字数
const TOP_MAX = 100; // 一度に返す最大件数

// ---- 受け口 ----

function doGet(e) {
  const p = (e && e.parameter) || {};
  const n = clampInt(p.n, 1, TOP_MAX, 10);
  const me = cleanId(p.me);
  const list = ranking();
  // プレイヤー ID は外に出さない（他人の名前を書きかえられないように）。自分の行だけ me: true を付ける
  const view = (r) => ({ rank: r.rank, name: r.name, score: r.score, heightCm: r.heightCm, date: r.date, me: !!me && r.id === me });
  const mine = me ? list.find((r) => r.id === me) : null;
  return json({ ok: true, total: list.length, ranking: list.slice(0, n).map(view), mine: mine ? view(mine) : null });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'bad_request' });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (req.action === 'submit') return json(submit(req));
    if (req.action === 'rename') return json(rename(req));
    return json({ ok: false, error: 'unknown_action' });
  } finally {
    lock.releaseLock();
  }
}

// ---- 処理 ----

function submit(req) {
  const id = cleanId(req.playerId);
  const name = cleanName(req.name);
  const score = Math.floor(Number(req.score));
  const heightCm = Number(req.heightCm);
  const count = Math.floor(Number(req.count));
  if (!id || !name) return { ok: false, error: 'bad_player' };
  if (!isPlausible(score, heightCm, count)) return { ok: false, error: 'bad_score' };

  setName(id, name);
  sheet(SHEET_SCORES).appendRow([new Date(), id, score, Math.round(heightCm * 10) / 10, count]);

  const list = ranking();
  const idx = list.findIndex((r) => r.id === id);
  return { ok: true, rank: idx + 1, total: list.length };
}

function rename(req) {
  const id = cleanId(req.playerId);
  const name = cleanName(req.name);
  if (!id || !name) return { ok: false, error: 'bad_player' };
  setName(id, name);
  return { ok: true };
}

// 1 人 1 件（ベストスコア）にまとめて、スコアの高い順に並べる
function ranking() {
  const names = playerNames();
  const best = {};
  const rows = sheet(SHEET_SCORES).getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const [date, id, score, heightCm] = rows[i];
    if (!id || !names[id]) continue; // players シートから消した人は載せない
    const s = Number(score) || 0;
    const cur = best[id];
    if (!cur || s > cur.score) best[id] = { id, score: s, heightCm: Number(heightCm) || 0, date };
  }
  return Object.keys(best)
    .map((id) => best[id])
    .sort((a, b) => b.score - a.score || a.date - b.date)
    .map((r, i) => ({
      rank: i + 1,
      id: r.id,
      name: names[r.id],
      score: r.score,
      heightCm: r.heightCm,
      date: Utilities.formatDate(new Date(r.date), 'Asia/Tokyo', 'yyyy-MM-dd'),
    }));
}

// ありえないスコアをはじく（ゲームの点の付け方から見た上限）
// 1 匹あたり 高さ 12cm×10 点、レア 100 点、ギリギリ賞 80 点、ピタッと賞は連続回数×50 点
function isPlausible(score, heightCm, count) {
  if (!isFinite(score) || !isFinite(heightCm) || !isFinite(count)) return false;
  if (score <= 0 || heightCm < 0 || count < 1 || count > 2000) return false;
  if (heightCm > count * 12 + 1) return false;
  const max = count * 12 * 10 + (50 * count * (count + 1)) / 2 + count * 180;
  return score <= max;
}

// ---- シート ----

function sheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (name === SHEET_SCORES) sh.appendRow(['日時', 'プレイヤーID', 'スコア', '高さ(cm)', '匹数']);
    if (name === SHEET_PLAYERS) sh.appendRow(['プレイヤーID', '名前']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function playerNames() {
  const rows = sheet(SHEET_PLAYERS).getDataRange().getValues();
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) map[rows[i][0]] = String(rows[i][1]);
  }
  return map;
}

function setName(id, name) {
  const sh = sheet(SHEET_PLAYERS);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      sh.getRange(i + 1, 2).setValue(name);
      return;
    }
  }
  sh.appendRow([id, name]);
}

// ---- 入力の整理 ----

function cleanId(v) {
  const s = String(v || '');
  return /^[a-z0-9]{8,32}$/.test(s) ? s : '';
}

function cleanName(v) {
  // 制御文字を除き、前後の空白を取り、長さをそろえる
  let s = String(v || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  s = Array.from(s).slice(0, NAME_MAX).join('');
  // 「=」などで始まる名前がシートで数式として扱われないようにする
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function clampInt(v, min, max, def) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
