(() => {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');

  // ── Palette ──────────────────────────────────────────────────────────────────
  const COLORS = [
    '#FF6B9D', '#FF5EBB', '#C084FC', '#A78BFA',
    '#67E8F9', '#34D399', '#86EFAC', '#FBBF24',
    '#FB923C', '#F87171', '#60A5FA', '#F472B6',
  ];

  // ── Config ───────────────────────────────────────────────────────────────────
  const CFG = {
    maxBubbles: 22,
    minR: 22,
    maxR: 74,
    splitAgeMin: 9000,   // ms before a bubble is allowed to split
    splitAgeMax: 22000,
    splitDur:    750,    // ms the split animation takes
    mergeRatio:  0.40,   // overlap > min_r * this → merge
    speed:       0.38,
    initN:       8,
  };

  let W, H, bubbles = [], lastTs = 0;
  let uidCounter = 0;

  // ── Utilities ─────────────────────────────────────────────────────────────────
  const rng   = (a, b) => a + Math.random() * (b - a);
  const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dist  = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function hex2rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ── Bubble class ─────────────────────────────────────────────────────────────
  class Bubble {
    constructor(x, y, r, color) {
      this.id    = ++uidCounter;
      this.r     = r;
      this.color = color ?? pick(COLORS);
      this.x     = x ?? rng(this.r + 60, W - this.r - 60);
      this.y     = y ?? rng(this.r + 60, H - this.r - 60);

      const spd = rng(CFG.speed * 0.55, CFG.speed * 1.45);
      const ang = rng(0, Math.PI * 2);
      this.vx = Math.cos(ang) * spd;
      this.vy = Math.sin(ang) * spd;

      this.age      = 0;
      this.splitAt  = rng(CFG.splitAgeMin, CFG.splitAgeMax);
      this.dead     = false;
      this.splitting  = false;
      this.sp       = 0;   // split progress 0–1
      this.sa       = 0;   // split axis angle

      // Breathing pulse (gentle size oscillation)
      this.pulse    = rng(0, Math.PI * 2);
      this.pulseSpd = rng(0.0008, 0.0018);
    }

    get childR() { return this.r * Math.SQRT1_2; }

    update(dt) {
      if (this.splitting) {
        this.sp += dt / CFG.splitDur;
        if (this.sp >= 1) {
          this.dead = true;
          const cr = this.childR;
          if (cr >= CFG.minR) {
            const off = this.r * 0.68;
            [1, -1].forEach(sign => {
              const b = new Bubble(
                this.x + Math.cos(this.sa) * off * sign,
                this.y + Math.sin(this.sa) * off * sign,
                cr,
                sign > 0 ? this.color : pick(COLORS)
              );
              b.vx = Math.cos(this.sa) * CFG.speed * sign;
              b.vy = Math.sin(this.sa) * CFG.speed * sign;
              bubbles.push(b);
            });
          }
        }
        return;
      }

      this.age   += dt;
      this.pulse += dt * this.pulseSpd;
      this.x     += this.vx;
      this.y     += this.vy;

      // Brownian nudge
      this.vx += rng(-0.007, 0.007);
      this.vy += rng(-0.007, 0.007);

      // Speed cap
      const spd = Math.hypot(this.vx, this.vy);
      if (spd > CFG.speed * 2.2) {
        this.vx = this.vx / spd * CFG.speed * 2.2;
        this.vy = this.vy / spd * CFG.speed * 2.2;
      }

      // Wall bounce
      if (this.x - this.r < 0)  { this.x = this.r;     this.vx =  Math.abs(this.vx); }
      if (this.x + this.r > W)  { this.x = W - this.r; this.vx = -Math.abs(this.vx); }
      if (this.y - this.r < 0)  { this.y = this.r;     this.vy =  Math.abs(this.vy); }
      if (this.y + this.r > H)  { this.y = H - this.r; this.vy = -Math.abs(this.vy); }

      // Trigger split?
      const living = bubbles.filter(b => !b.dead).length;
      if (this.age > this.splitAt && this.childR >= CFG.minR && living < CFG.maxBubbles) {
        this.splitting = true;
        this.sp = 0;
        this.sa = rng(0, Math.PI * 2);
      }
    }

    drawRadius() {
      // Slightly pulsing display radius
      return this.r * (1 + Math.sin(this.pulse) * 0.028);
    }

    draw() {
      if (this.splitting) { this.drawSplit(); return; }
      drawDisk(this.x, this.y, this.drawRadius(), this.color);
    }

    drawSplit() {
      const t = this.sp;

      if (t < 0.5) {
        // Stretch along split axis
        const e  = t / 0.5;
        const sx = 1 + e * 0.52;
        const sy = 1 - e * 0.26;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.sa);
        ctx.scale(sx, sy);
        drawDisk(0, 0, this.r, this.color);
        ctx.restore();
      } else {
        // Two daughters emerge
        const e    = (t - 0.5) / 0.5;
        const ease = e < 0.5 ? 2 * e * e : -1 + (4 - 2 * e) * e;
        const off  = this.r * 0.88 * ease;
        const cr   = this.childR * (1 - ease * 0.09);

        const x1 = this.x + Math.cos(this.sa) * off;
        const y1 = this.y + Math.sin(this.sa) * off;
        const x2 = this.x - Math.cos(this.sa) * off;
        const y2 = this.y - Math.sin(this.sa) * off;

        if (Math.hypot(x1 - x2, y1 - y2) < cr * 2.2) {
          drawBlob(x1, y1, cr, x2, y2, cr, this.color, this.color);
        } else {
          drawDisk(x1, y1, cr, this.color);
          drawDisk(x2, y2, cr, this.color);
        }
      }
    }
  }

  // ── Rendering helpers ─────────────────────────────────────────────────────────
  function drawDisk(x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = hex2rgba(color, 0.74);
    ctx.fill();

    // Candy-shine highlight (upper-left radial gradient)
    const shine = ctx.createRadialGradient(
      x - r * 0.28, y - r * 0.32, r * 0.04,
      x,            y,            r
    );
    shine.addColorStop(0,   'rgba(255,255,255,0.38)');
    shine.addColorStop(0.38,'rgba(255,255,255,0.06)');
    shine.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.fill();

    // Rim
    ctx.strokeStyle = hex2rgba(color, 0.38);
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }

  // Draw the blobby connector between two touching/overlapping circles
  function drawBlob(x1, y1, r1, x2, y2, r2, col1, col2) {
    const dx = x2 - x1, dy = y2 - y1;
    const d  = Math.hypot(dx, dy);
    if (d >= r1 + r2 || d <= Math.abs(r1 - r2) + 0.5 || d <= 0) return;

    const ang = Math.atan2(dy, dx);
    const t   = d / (r1 + r2);             // 1 = just touching, 0 = centers coincide

    // Spread angle controls how wide the "neck" is
    const spread = (1 - t) * 0.9;
    const a1 = spread * Math.PI * 0.82;
    const a2 = spread * Math.PI * 0.82;

    // 4 junction points on each circle
    const p0x = x1 + Math.cos(ang + a1) * r1,  p0y = y1 + Math.sin(ang + a1) * r1;
    const p1x = x1 + Math.cos(ang - a1) * r1,  p1y = y1 + Math.sin(ang - a1) * r1;
    const p2x = x2 + Math.cos(ang + Math.PI - a2) * r2, p2y = y2 + Math.sin(ang + Math.PI - a2) * r2;
    const p3x = x2 + Math.cos(ang + Math.PI + a2) * r2, p3y = y2 + Math.sin(ang + Math.PI + a2) * r2;

    // Bezier handle length: longer = more blobby bulge
    const cpL = d * 0.48 * (1 - t);

    const c1tx = p0x + Math.cos(ang) * cpL,         c1ty = p0y + Math.sin(ang) * cpL;
    const c2tx = p2x + Math.cos(ang + Math.PI) * cpL, c2ty = p2y + Math.sin(ang + Math.PI) * cpL;
    const c3tx = p3x + Math.cos(ang + Math.PI) * cpL, c3ty = p3y + Math.sin(ang + Math.PI) * cpL;
    const c4tx = p1x + Math.cos(ang) * cpL,           c4ty = p1y + Math.sin(ang) * cpL;

    ctx.beginPath();
    ctx.moveTo(p0x, p0y);
    ctx.bezierCurveTo(c1tx, c1ty, c2tx, c2ty, p2x, p2y);
    ctx.arc(x2, y2, r2, ang + Math.PI - a2, ang + Math.PI + a2, false);
    ctx.bezierCurveTo(c3tx, c3ty, c4tx, c4ty, p1x, p1y);
    ctx.arc(x1, y1, r1, ang - a1, ang + a1, false);
    ctx.closePath();

    const col = r1 >= r2 ? col1 : col2;
    ctx.fillStyle = hex2rgba(col, 0.74);
    ctx.fill();
  }

  // ── Merge logic ───────────────────────────────────────────────────────────────
  function checkMerges() {
    const live = bubbles.filter(b => !b.dead && !b.splitting);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        if (a.dead || b.dead) continue;

        const d       = dist(a, b);
        const overlap = a.r + b.r - d;
        if (overlap <= Math.min(a.r, b.r) * CFG.mergeRatio) continue;

        const [big, sml] = a.r >= b.r ? [a, b] : [b, a];
        const bigR0 = big.r, smlR0 = sml.r;

        // Conserve area
        big.r = Math.min(Math.hypot(bigR0, smlR0), CFG.maxR);

        // Conserve momentum (area ∝ mass)
        const bA = bigR0 * bigR0, sA = smlR0 * smlR0, tot = bA + sA;
        big.vx = (big.vx * bA + sml.vx * sA) / tot;
        big.vy = (big.vy * bA + sml.vy * sA) / tot;

        // Reset lifecycle
        big.age     = 0;
        big.splitAt = rng(CFG.splitAgeMin, CFG.splitAgeMax);

        sml.dead = true;
      }
    }
  }

  // ── Main loop ─────────────────────────────────────────────────────────────────
  function loop(ts) {
    const dt = Math.min(ts - lastTs, 80);
    lastTs = ts;

    bubbles = bubbles.filter(b => !b.dead);
    bubbles.forEach(b => b.update(dt));
    checkMerges();

    ctx.clearRect(0, 0, W, H);

    // Blob connectors — drawn before individual circles so circles sit on top
    const live = bubbles.filter(b => !b.dead && !b.splitting);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        const dr = a.drawRadius(), br = b.drawRadius();
        if (dist(a, b) < dr + br) {
          drawBlob(a.x, a.y, dr, b.x, b.y, br, a.color, b.color);
        }
      }
    }

    // Circles
    bubbles.forEach(b => { if (!b.dead) b.draw(); });

    requestAnimationFrame(loop);
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < CFG.initN; i++) {
    const r = rng(CFG.minR * 1.4, CFG.maxR * 0.88);
    bubbles.push(new Bubble(null, null, r));
  }

  requestAnimationFrame(ts => { lastTs = ts; requestAnimationFrame(loop); });
})();
