// 箱（長方形）だけを扱う、小さな 2D 物理エンジン。
// 積み上げが安定するように、Box2D-Lite と同じ考え方（接触点のクリッピング、
// 逐次インパルス法、前フレームの力を引き継ぐウォームスタート）で作っている。
// 単位はメートル・秒。y 軸は下向き（画面と同じ）。
(function () {
  'use strict';

  // ---- ベクトルの小道具 ----
  const v = (x, y) => ({ x, y });
  const add = (a, b) => v(a.x + b.x, a.y + b.y);
  const sub = (a, b) => v(a.x - b.x, a.y - b.y);
  const mul = (a, s) => v(a.x * s, a.y * s);
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const crossVV = (a, b) => a.x * b.y - a.y * b.x;
  const crossSV = (s, a) => v(-s * a.y, s * a.x);
  // 回転行列（列ベクトル col1, col2）
  const rotMat = (a) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { c1: v(c, s), c2: v(-s, c) };
  };
  const mulMV = (m, a) => v(m.c1.x * a.x + m.c2.x * a.y, m.c1.y * a.x + m.c2.y * a.y);
  const mulMTV = (m, a) => v(dot(a, m.c1), dot(a, m.c2));

  // 辺の番号（接触点の識別に使う）
  const NO_EDGE = 0;
  const EDGE1 = 1;
  const EDGE2 = 2;
  const EDGE3 = 3;
  const EDGE4 = 4;

  const ALLOWED_PENETRATION = 0.01;
  const BIAS_FACTOR = 0.2;

  let nextId = 1;

  class Body {
    /**
     * @param {number} w 幅（m）
     * @param {number} h 高さ（m）
     * @param {number} density 密度。0 なら動かない（固定）
     */
    constructor(w, h, density) {
      this.id = nextId++;
      this.w = w;
      this.h = h;
      this.pos = v(0, 0);
      this.rot = 0;
      this.vel = v(0, 0);
      this.angVel = 0;
      this.friction = 0.6;
      this.radius = Math.hypot(w, h) / 2; // 大まかな当たりの判定用
      if (density > 0) {
        this.mass = w * h * density;
        this.invMass = 1 / this.mass;
        this.I = (this.mass * (w * w + h * h)) / 12;
        this.invI = 1 / this.I;
      } else {
        this.mass = Infinity;
        this.invMass = 0;
        this.I = Infinity;
        this.invI = 0;
      }
      this.userData = null;
    }
  }

  function flip(fp) {
    let t = fp.in1;
    fp.in1 = fp.in2;
    fp.in2 = t;
    t = fp.out1;
    fp.out1 = fp.out2;
    fp.out2 = t;
  }
  const fpKey = (fp) => fp.in1 | (fp.out1 << 3) | (fp.in2 << 6) | (fp.out2 << 9);

  function clipSegmentToLine(vIn, normal, offset, clipEdge) {
    const out = [];
    const d0 = dot(normal, vIn[0].v) - offset;
    const d1 = dot(normal, vIn[1].v) - offset;
    if (d0 <= 0) out.push({ v: vIn[0].v, fp: { ...vIn[0].fp } });
    if (d1 <= 0) out.push({ v: vIn[1].v, fp: { ...vIn[1].fp } });
    if (d0 * d1 < 0) {
      const t = d0 / (d0 - d1);
      const p = add(vIn[0].v, mul(sub(vIn[1].v, vIn[0].v), t));
      let fp;
      if (d0 > 0) {
        fp = { ...vIn[0].fp, in1: clipEdge, in2: NO_EDGE };
      } else {
        fp = { ...vIn[1].fp, out1: clipEdge, out2: NO_EDGE };
      }
      out.push({ v: p, fp });
    }
    return out;
  }

  function computeIncidentEdge(h, pos, R, normal) {
    const n = mul(mulMTV(R, normal), -1);
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    let c0;
    let c1;
    const mk = (x, y, inE, outE) => ({ v: v(x, y), fp: { in1: NO_EDGE, out1: NO_EDGE, in2: inE, out2: outE } });
    if (ax > ay) {
      if (n.x > 0) {
        c0 = mk(h.x, -h.y, EDGE3, EDGE4);
        c1 = mk(h.x, h.y, EDGE4, EDGE1);
      } else {
        c0 = mk(-h.x, h.y, EDGE1, EDGE2);
        c1 = mk(-h.x, -h.y, EDGE2, EDGE3);
      }
    } else if (n.y > 0) {
      c0 = mk(h.x, h.y, EDGE4, EDGE1);
      c1 = mk(-h.x, h.y, EDGE1, EDGE2);
    } else {
      c0 = mk(-h.x, -h.y, EDGE2, EDGE3);
      c1 = mk(h.x, -h.y, EDGE3, EDGE4);
    }
    c0.v = add(pos, mulMV(R, c0.v));
    c1.v = add(pos, mulMV(R, c1.v));
    return [c0, c1];
  }

  // 2 つの箱の接触点を求める（なければ空配列）。法線は A → B 向き。
  function collide(A, B) {
    const hA = v(A.w / 2, A.h / 2);
    const hB = v(B.w / 2, B.h / 2);
    const RA = rotMat(A.rot);
    const RB = rotMat(B.rot);
    const dp = sub(B.pos, A.pos);
    const dA = mulMTV(RA, dp);
    const dB = mulMTV(RB, dp);
    // C = RA^T * RB
    const C = {
      c1: v(dot(RA.c1, RB.c1), dot(RA.c2, RB.c1)),
      c2: v(dot(RA.c1, RB.c2), dot(RA.c2, RB.c2)),
    };
    const absC = {
      c1: v(Math.abs(C.c1.x), Math.abs(C.c1.y)),
      c2: v(Math.abs(C.c2.x), Math.abs(C.c2.y)),
    };
    const absCT = { c1: v(absC.c1.x, absC.c2.x), c2: v(absC.c1.y, absC.c2.y) };

    const tA = mulMV(absC, hB);
    const faceA = v(Math.abs(dA.x) - hA.x - tA.x, Math.abs(dA.y) - hA.y - tA.y);
    if (faceA.x > 0 || faceA.y > 0) return [];
    const tB = mulMV(absCT, hA);
    const faceB = v(Math.abs(dB.x) - tB.x - hB.x, Math.abs(dB.y) - tB.y - hB.y);
    if (faceB.x > 0 || faceB.y > 0) return [];

    const relTol = 0.95;
    const absTol = 0.01;
    let axis = 'AX';
    let separation = faceA.x;
    let normal = dA.x > 0 ? RA.c1 : mul(RA.c1, -1);
    if (faceA.y > relTol * separation + absTol * hA.y) {
      axis = 'AY';
      separation = faceA.y;
      normal = dA.y > 0 ? RA.c2 : mul(RA.c2, -1);
    }
    if (faceB.x > relTol * separation + absTol * hB.x) {
      axis = 'BX';
      separation = faceB.x;
      normal = dB.x > 0 ? RB.c1 : mul(RB.c1, -1);
    }
    if (faceB.y > relTol * separation + absTol * hB.y) {
      axis = 'BY';
      separation = faceB.y;
      normal = dB.y > 0 ? RB.c2 : mul(RB.c2, -1);
    }

    let frontNormal;
    let sideNormal;
    let front;
    let negSide;
    let posSide;
    let negEdge;
    let posEdge;
    let incident;
    let side;
    if (axis === 'AX') {
      frontNormal = normal;
      front = dot(A.pos, frontNormal) + hA.x;
      sideNormal = RA.c2;
      side = dot(A.pos, sideNormal);
      negSide = -side + hA.y;
      posSide = side + hA.y;
      negEdge = EDGE3;
      posEdge = EDGE1;
      incident = computeIncidentEdge(hB, B.pos, RB, frontNormal);
    } else if (axis === 'AY') {
      frontNormal = normal;
      front = dot(A.pos, frontNormal) + hA.y;
      sideNormal = RA.c1;
      side = dot(A.pos, sideNormal);
      negSide = -side + hA.x;
      posSide = side + hA.x;
      negEdge = EDGE2;
      posEdge = EDGE4;
      incident = computeIncidentEdge(hB, B.pos, RB, frontNormal);
    } else if (axis === 'BX') {
      frontNormal = mul(normal, -1);
      front = dot(B.pos, frontNormal) + hB.x;
      sideNormal = RB.c2;
      side = dot(B.pos, sideNormal);
      negSide = -side + hB.y;
      posSide = side + hB.y;
      negEdge = EDGE3;
      posEdge = EDGE1;
      incident = computeIncidentEdge(hA, A.pos, RA, frontNormal);
    } else {
      frontNormal = mul(normal, -1);
      front = dot(B.pos, frontNormal) + hB.y;
      sideNormal = RB.c1;
      side = dot(B.pos, sideNormal);
      negSide = -side + hB.x;
      posSide = side + hB.x;
      negEdge = EDGE2;
      posEdge = EDGE4;
      incident = computeIncidentEdge(hA, A.pos, RA, frontNormal);
    }

    const clip1 = clipSegmentToLine(incident, mul(sideNormal, -1), negSide, negEdge);
    if (clip1.length < 2) return [];
    const clip2 = clipSegmentToLine(clip1, sideNormal, posSide, posEdge);
    if (clip2.length < 2) return [];

    const contacts = [];
    for (let i = 0; i < 2; i++) {
      const sep = dot(frontNormal, clip2[i].v) - front;
      if (sep <= 0) {
        const fp = clip2[i].fp;
        if (axis === 'BX' || axis === 'BY') flip(fp);
        contacts.push({
          separation: sep,
          normal,
          position: sub(clip2[i].v, mul(frontNormal, sep)),
          key: fpKey(fp),
          Pn: 0,
          Pt: 0,
          r1: null,
          r2: null,
          massNormal: 0,
          massTangent: 0,
          bias: 0,
        });
      }
    }
    return contacts;
  }

  class Arbiter {
    constructor(b1, b2, contacts) {
      this.b1 = b1;
      this.b2 = b2;
      this.contacts = contacts;
      this.friction = Math.sqrt(b1.friction * b2.friction);
    }

    update(newContacts) {
      for (const nc of newContacts) {
        const old = this.contacts.find((c) => c.key === nc.key);
        if (old) {
          nc.Pn = old.Pn;
          nc.Pt = old.Pt;
        }
      }
      this.contacts = newContacts;
    }

    preStep(invDt) {
      const { b1, b2 } = this;
      for (const c of this.contacts) {
        const r1 = sub(c.position, b1.pos);
        const r2 = sub(c.position, b2.pos);
        const rn1 = dot(r1, c.normal);
        const rn2 = dot(r2, c.normal);
        let k = b1.invMass + b2.invMass;
        k += b1.invI * (dot(r1, r1) - rn1 * rn1) + b2.invI * (dot(r2, r2) - rn2 * rn2);
        c.massNormal = 1 / k;
        const tangent = v(c.normal.y, -c.normal.x);
        const rt1 = dot(r1, tangent);
        const rt2 = dot(r2, tangent);
        let kt = b1.invMass + b2.invMass;
        kt += b1.invI * (dot(r1, r1) - rt1 * rt1) + b2.invI * (dot(r2, r2) - rt2 * rt2);
        c.massTangent = 1 / kt;
        c.bias = -BIAS_FACTOR * invDt * Math.min(0, c.separation + ALLOWED_PENETRATION);
        c.r1 = r1;
        c.r2 = r2;
        // ウォームスタート（前フレームの力をまず与える）
        const P = add(mul(c.normal, c.Pn), mul(tangent, c.Pt));
        b1.vel = sub(b1.vel, mul(P, b1.invMass));
        b1.angVel -= b1.invI * crossVV(r1, P);
        b2.vel = add(b2.vel, mul(P, b2.invMass));
        b2.angVel += b2.invI * crossVV(r2, P);
      }
    }

    applyImpulse() {
      const { b1, b2 } = this;
      for (const c of this.contacts) {
        const { r1, r2 } = c;
        let dv = sub(add(b2.vel, crossSV(b2.angVel, r2)), add(b1.vel, crossSV(b1.angVel, r1)));
        const vn = dot(dv, c.normal);
        let dPn = c.massNormal * (-vn + c.bias);
        const Pn0 = c.Pn;
        c.Pn = Math.max(Pn0 + dPn, 0);
        dPn = c.Pn - Pn0;
        let P = mul(c.normal, dPn);
        b1.vel = sub(b1.vel, mul(P, b1.invMass));
        b1.angVel -= b1.invI * crossVV(r1, P);
        b2.vel = add(b2.vel, mul(P, b2.invMass));
        b2.angVel += b2.invI * crossVV(r2, P);

        dv = sub(add(b2.vel, crossSV(b2.angVel, r2)), add(b1.vel, crossSV(b1.angVel, r1)));
        const tangent = v(c.normal.y, -c.normal.x);
        const vt = dot(dv, tangent);
        let dPt = c.massTangent * -vt;
        const maxPt = this.friction * c.Pn;
        const Pt0 = c.Pt;
        c.Pt = Math.max(-maxPt, Math.min(Pt0 + dPt, maxPt));
        dPt = c.Pt - Pt0;
        P = mul(tangent, dPt);
        b1.vel = sub(b1.vel, mul(P, b1.invMass));
        b1.angVel -= b1.invI * crossVV(r1, P);
        b2.vel = add(b2.vel, mul(P, b2.invMass));
        b2.angVel += b2.invI * crossVV(r2, P);
      }
    }
  }

  class World {
    constructor(gravity, iterations) {
      this.gravity = gravity;
      this.iterations = iterations || 10;
      this.bodies = [];
      this.arbiters = new Map();
      this.linearDamping = 0.02;
      this.angularDamping = 0.05;
      // 新しくぶつかったときに呼ぶ（bodyA, bodyB, ぶつかった速さ m/s）
      this.onImpact = null;
    }

    add(body) {
      this.bodies.push(body);
    }

    remove(body) {
      const i = this.bodies.indexOf(body);
      if (i >= 0) this.bodies.splice(i, 1);
      for (const [k, a] of this.arbiters) {
        if (a.b1 === body || a.b2 === body) this.arbiters.delete(k);
      }
    }

    clear() {
      this.bodies = [];
      this.arbiters.clear();
    }

    // 接している相手の一覧
    contactsOf(body) {
      const list = [];
      for (const a of this.arbiters.values()) {
        if (a.b1 === body) list.push(a.b2);
        else if (a.b2 === body) list.push(a.b1);
      }
      return list;
    }

    step(dt) {
      const invDt = dt > 0 ? 1 / dt : 0;
      const bodies = this.bodies;
      const impacts = [];

      // 当たりの判定
      for (let i = 0; i < bodies.length; i++) {
        const bi = bodies[i];
        for (let j = i + 1; j < bodies.length; j++) {
          const bj = bodies[j];
          if (bi.invMass === 0 && bj.invMass === 0) continue;
          const key = bi.id < bj.id ? `${bi.id}:${bj.id}` : `${bj.id}:${bi.id}`;
          const dx = bi.pos.x - bj.pos.x;
          const dy = bi.pos.y - bj.pos.y;
          const rr = bi.radius + bj.radius;
          if (dx * dx + dy * dy > rr * rr) {
            this.arbiters.delete(key);
            continue;
          }
          const b1 = bi.id < bj.id ? bi : bj;
          const b2 = b1 === bi ? bj : bi;
          const contacts = collide(b1, b2);
          if (contacts.length > 0) {
            const arb = this.arbiters.get(key);
            if (arb) {
              arb.update(contacts);
            } else {
              this.arbiters.set(key, new Arbiter(b1, b2, contacts));
              // ぶつかった速さ（法線方向の相対速度）
              const c = contacts[0];
              const rel = sub(b2.vel, b1.vel);
              impacts.push([b1, b2, Math.abs(dot(rel, c.normal))]);
            }
          } else {
            this.arbiters.delete(key);
          }
        }
      }

      // 力（重力）で速度を更新
      const ld = Math.max(0, 1 - this.linearDamping * dt);
      const ad = Math.max(0, 1 - this.angularDamping * dt);
      for (const b of bodies) {
        if (b.invMass === 0) continue;
        b.vel = add(b.vel, mul(this.gravity, dt));
        b.vel = mul(b.vel, ld);
        b.angVel *= ad;
      }

      for (const a of this.arbiters.values()) a.preStep(invDt);
      for (let it = 0; it < this.iterations; it++) {
        for (const a of this.arbiters.values()) a.applyImpulse();
      }

      // 速度で位置を更新
      for (const b of bodies) {
        if (b.invMass === 0) continue;
        b.pos = add(b.pos, mul(b.vel, dt));
        b.rot += b.angVel * dt;
      }

      if (this.onImpact) {
        for (const [a, b, s] of impacts) this.onImpact(a, b, s);
      }
    }
  }

  window.Physics = { Body, World, vec: v };
})();
