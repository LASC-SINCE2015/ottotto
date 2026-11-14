// キャラクター（四角い生き物）の描画。
// 元の手描きの線画（design/chara_original.jpg）の座標をそのまま使い、拡大縮小して描く。
(function () {
  'use strict';

  // 元画像での胴体の範囲（この四角が当たり判定に対応する）
  const SRC_W = 420;
  const SRC_CX = 410;
  const SRC_CY = 613;
  const INK = '#2b2b2b';

  // 星形（キラキラ目）
  function star(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? r : r * 0.45;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  function stroke(ctx, fn) {
    ctx.beginPath();
    fn();
    ctx.stroke();
  }

  /**
   * キャラクターを描く。呼び出し側で中心へ translate / rotate しておく。
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} o
   *   w      … 胴体の幅（ワールド単位）
   *   face   … 'normal' | 'kira' | 'nemui' | 'nikkori'
   *   panic  … 0〜1。大きいほど焦った顔になる
   *   fill   … 塗りの色
   *   glow   … 0〜1。ピカッと光る演出
   *   blink  … まばたき中か
   *   t      … 経過時間（秒。揺れのアニメーション用）
   */
  function draw(ctx, o) {
    const s = o.w / SRC_W;
    const panic = o.panic || 0;
    const t = o.t || 0;
    const scared = panic > 0.45 && o.face !== 'nemui';

    ctx.save();
    ctx.scale(s, s);
    ctx.translate(-SRC_CX, -SRC_CY);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 12;

    // 焦っているときは全体を小刻みに震わせる
    if (scared) {
      const amp = 6 * panic;
      ctx.translate(Math.sin(t * 61) * amp, Math.cos(t * 47) * amp * 0.5);
    }

    // --- 塗り（シルエット） ---
    ctx.save();
    if (o.glow > 0) {
      ctx.shadowColor = `rgba(255, 210, 60, ${Math.min(1, o.glow)})`;
      ctx.shadowBlur = 120 * o.glow;
    }
    ctx.fillStyle = o.fill || '#ffffff';
    ctx.beginPath();
    ctx.moveTo(262, 392);
    ctx.bezierCurveTo(300, 320, 330, 265, 360, 272);
    ctx.bezierCurveTo(395, 280, 405, 320, 405, 382);
    ctx.lineTo(500, 384);
    ctx.bezierCurveTo(530, 320, 555, 280, 578, 280);
    ctx.bezierCurveTo(610, 285, 622, 340, 625, 392);
    ctx.bezierCurveTo(675, 450, 670, 525, 622, 560);
    ctx.lineTo(604, 845);
    ctx.lineTo(205, 842);
    ctx.lineTo(218, 560);
    ctx.bezierCurveTo(205, 520, 210, 460, 262, 392);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // --- 線画（元の絵と同じく、ところどころ途切れた線） ---
    // 左耳
    stroke(ctx, () => {
      ctx.moveTo(268, 388);
      ctx.bezierCurveTo(300, 320, 330, 265, 360, 272);
      ctx.bezierCurveTo(395, 280, 405, 320, 405, 382);
    });
    // 頭のてっぺん
    stroke(ctx, () => {
      ctx.moveTo(405, 382);
      ctx.lineTo(497, 385);
    });
    // 右耳
    stroke(ctx, () => {
      ctx.moveTo(505, 385);
      ctx.bezierCurveTo(530, 320, 555, 280, 578, 280);
      ctx.bezierCurveTo(610, 285, 622, 340, 625, 390);
    });
    // ほっぺ
    stroke(ctx, () => {
      ctx.moveTo(250, 440);
      ctx.bezierCurveTo(212, 468, 215, 528, 290, 538);
    });
    stroke(ctx, () => {
      ctx.moveTo(632, 430);
      ctx.bezierCurveTo(672, 462, 668, 522, 585, 546);
    });
    // 腕（焦るとバタバタ）
    const flap = scared ? Math.sin(t * 30) * 25 * panic : 0;
    ctx.lineWidth = 15;
    stroke(ctx, () => {
      ctx.moveTo(195, 505);
      ctx.bezierCurveTo(140, 500 - flap, 128, 560 - flap, 195, 568);
    });
    stroke(ctx, () => {
      ctx.moveTo(650, 518);
      ctx.bezierCurveTo(700, 510 + flap, 715, 540 + flap, 640, 605);
    });
    ctx.lineWidth = 12;
    // 体の左の線
    stroke(ctx, () => {
      ctx.moveTo(218, 588);
      ctx.lineTo(185, 805);
    });
    // 左足
    ctx.lineWidth = 15;
    stroke(ctx, () => {
      ctx.moveTo(185, 805);
      ctx.bezierCurveTo(150, 815, 158, 862, 215, 846);
    });
    ctx.lineWidth = 12;
    // 底の線
    stroke(ctx, () => {
      ctx.moveTo(248, 832);
      ctx.lineTo(515, 842);
    });
    // 右側の線と右足
    stroke(ctx, () => {
      ctx.moveTo(622, 645);
      ctx.bezierCurveTo(615, 720, 600, 800, 575, 880);
    });
    stroke(ctx, () => {
      ctx.moveTo(515, 848);
      ctx.bezierCurveTo(512, 885, 535, 892, 575, 880);
    });
    // しっぽ
    stroke(ctx, () => {
      ctx.moveTo(612, 762);
      ctx.bezierCurveTo(652, 752, 684, 792, 612, 806);
    });

    // --- 顔 ---
    const browLift = scared ? 22 * panic : 0;
    // まゆ
    stroke(ctx, () => {
      ctx.moveTo(318, 455 - browLift);
      ctx.bezierCurveTo(330, 420 - browLift, 380, 410 - browLift * 1.4, 412, 423 - browLift);
    });
    stroke(ctx, () => {
      ctx.moveTo(495, 423 - browLift);
      ctx.bezierCurveTo(530, 410 - browLift * 1.4, 575, 415 - browLift, 582, 432 - browLift);
    });

    drawEyes(ctx, o, scared, panic, t);

    // 口（元の絵の「ψ」のような形）
    stroke(ctx, () => {
      ctx.moveTo(430, 438);
      ctx.quadraticCurveTo(438, 454, 452, 444);
      ctx.quadraticCurveTo(465, 438, 478, 446);
    });
    const mouthOpen = scared ? 10 * panic : 0;
    stroke(ctx, () => {
      ctx.moveTo(448, 452);
      ctx.lineTo(458 - mouthOpen, 522 + mouthOpen);
    });
    stroke(ctx, () => {
      ctx.moveTo(472, 450);
      ctx.lineTo(476 + mouthOpen, 512 + mouthOpen);
    });

    // 汗（焦っているとき）
    if (scared) {
      ctx.fillStyle = '#7cc4ff';
      ctx.lineWidth = 7;
      const drops = [
        [690, 400, 1],
        [180, 420, 0.8],
      ];
      for (const [dx, dy, k] of drops) {
        const yy = dy + ((t * 120 * k) % 60);
        ctx.beginPath();
        ctx.moveTo(dx, yy - 34);
        ctx.quadraticCurveTo(dx + 22, yy, dx, yy + 12);
        ctx.quadraticCurveTo(dx - 22, yy, dx, yy - 34);
        ctx.fill();
        ctx.stroke();
      }
    }

    // ほっぺの赤み（にっこり・キラキラ）
    if (o.face === 'nikkori' || o.face === 'kira') {
      ctx.fillStyle = 'rgba(255, 120, 140, 0.45)';
      ctx.beginPath();
      ctx.ellipse(300, 520, 32, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(590, 515, 32, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ねむい: Zzz
    if (o.face === 'nemui') {
      ctx.fillStyle = INK;
      ctx.font = 'bold 70px sans-serif';
      const bob = Math.sin(t * 2) * 10;
      ctx.fillText('z', 640, 330 + bob);
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText('z', 690, 280 + bob);
    }

    ctx.restore();
  }

  function drawEyes(ctx, o, scared, panic, t) {
    const L = [385, 465];
    const R = [538, 462];

    if (o.face === 'nemui' && !scared) {
      stroke(ctx, () => {
        ctx.moveTo(355, 468);
        ctx.quadraticCurveTo(385, 480, 415, 468);
      });
      stroke(ctx, () => {
        ctx.moveTo(512, 466);
        ctx.quadraticCurveTo(538, 478, 564, 466);
      });
      return;
    }
    if (o.blink && !scared) {
      stroke(ctx, () => {
        ctx.moveTo(355, 466);
        ctx.lineTo(415, 466);
      });
      stroke(ctx, () => {
        ctx.moveTo(512, 463);
        ctx.lineTo(564, 463);
      });
      return;
    }
    if (scared) {
      // (◎_◎) 目を見開いて、黒目がちいさく震える
      const grow = 1 + 0.35 * panic;
      ctx.fillStyle = '#ffffff';
      for (const [cx, cy] of [L, R]) {
        ctx.beginPath();
        ctx.ellipse(cx, cy - 4, 30 * grow, 27 * grow, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(cx, cy - 4, 15 * grow, 13 * grow, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#2b2b2b';
        ctx.beginPath();
        ctx.arc(cx + Math.sin(t * 50 + cx) * 4, cy - 4 + Math.cos(t * 43) * 3, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
      }
      return;
    }
    if (o.face === 'kira') {
      ctx.fillStyle = '#ffcf33';
      ctx.lineWidth = 8;
      const tw = 1 + Math.sin(t * 6) * 0.12;
      star(ctx, L[0], L[1], 34 * tw);
      ctx.fill();
      ctx.stroke();
      star(ctx, R[0], R[1], 32 * tw);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 12;
      return;
    }
    if (o.face === 'nikkori') {
      stroke(ctx, () => {
        ctx.moveTo(357, 478);
        ctx.quadraticCurveTo(385, 438, 413, 478);
      });
      stroke(ctx, () => {
        ctx.moveTo(512, 476);
        ctx.quadraticCurveTo(538, 438, 564, 476);
      });
      return;
    }
    // ふつう: 元の絵と同じ、まるい目
    ctx.beginPath();
    ctx.ellipse(L[0], L[1], 30, 22, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(R[0], R[1], 25, 24, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  window.Chara = { draw };
})();
