import { currentTheme } from "./theme.js";

const canvas = document.querySelector("#ambientCanvas");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (canvas && !reduceMotion) {
  const ctx = canvas.getContext("2d", { alpha: true });
  const COUNT = 140;
  const REPEL_RADIUS = 160;
  const LINK = 150;
  const GLOBE_POINTS = 320;
  const TILT = 0.42;

  let w = 0;
  let h = 0;
  let particles = [];
  let raf = null;
  let maxScroll = 1;
  const mouse = { x: -9999, y: -9999 };

  const sphere = [];
  for (let i = 0; i < GLOBE_POINTS; i += 1) {
    const y = 1 - (i / (GLOBE_POINTS - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const phi = i * Math.PI * (3 - Math.sqrt(5));
    sphere.push([Math.cos(phi) * r, y, Math.sin(phi) * r]);
  }

  function latLonToVec(lat, lon) {
    const la = (lat * Math.PI) / 180;
    const lo = (lon * Math.PI) / 180;
    return [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
  }
  const grid = [];
  for (let lon = 0; lon < 360; lon += 30) {
    const line = [];
    for (let lat = -90; lat <= 90; lat += 9) {
      line.push(latLonToVec(lat, lon));
    }
    grid.push(line);
  }
  for (const lat of [-60, -30, 0, 30, 60]) {
    const line = [];
    for (let lon = 0; lon <= 360; lon += 9) {
      line.push(latLonToVec(lat, lon));
    }
    grid.push(line);
  }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }

  function computeMax() {
    maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }

  function seed() {
    particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 1 + Math.random() * 2.4,
      vy: 0.14 + Math.random() * 0.4,
      vx: (Math.random() - 0.5) * 0.1,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function rgb() {
    return currentTheme() === "light" ? "40,84,134" : "150,196,255";
  }

  function drawGlobe() {
    const cx = w * 0.84;
    const cy = h * 0.42;
    const R = Math.min(w, h) * 0.62;
    const ratio = Math.min(1, window.scrollY / maxScroll);
    const angle = ratio * Math.PI * 4;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const cosT = Math.cos(TILT);
    const sinT = Math.sin(TILT);
    const project = ([px, py, pz]) => {
      const x1 = px * cosA + pz * sinA;
      const z1 = -px * sinA + pz * cosA;
      const y2 = py * cosT - z1 * sinT;
      const z2 = py * sinT + z1 * cosT;
      return [cx + x1 * R, cy - y2 * R, (z2 + 1) / 2];
    };

    const cool = currentTheme() === "light" ? [40, 84, 134] : [150, 196, 255];
    const warm = [226, 74, 52];
    const gr = Math.round(cool[0] + (warm[0] - cool[0]) * ratio);
    const gg = Math.round(cool[1] + (warm[1] - cool[1]) * ratio);
    const gb = Math.round(cool[2] + (warm[2] - cool[2]) * ratio);
    const g = `${gr},${gg},${gb}`;

    if (ratio > 0.002) {
      const fillTop = cy + R - 2 * R * ratio;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = `rgba(226,74,52,${(0.05 + ratio * 0.16).toFixed(3)})`;
      ctx.fillRect(cx - R, fillTop, R * 2, R * 2);
      ctx.strokeStyle = `rgba(240,120,90,${(0.18 + ratio * 0.22).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - R, fillTop);
      ctx.lineTo(cx + R, fillTop);
      ctx.stroke();
      ctx.restore();
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${g},0.16)`;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    for (const line of grid) {
      for (let i = 1; i < line.length; i += 1) {
        const a = project(line[i - 1]);
        const b = project(line[i]);
        const depth = (a[2] + b[2]) / 2;
        if (depth < 0.42) {
          continue;
        }
        ctx.strokeStyle = `rgba(${g},${(0.04 + depth * 0.13).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
    }

    for (const v of sphere) {
      const [sx, sy, depth] = project(v);
      ctx.fillStyle = `rgba(${g},${(0.05 + depth * 0.22).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.8 + depth * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function step() {
    ctx.clearRect(0, 0, w, h);
    const base = rgb();

    drawGlobe();

    for (const p of particles) {
      p.phase += 0.01;
      p.x += p.vx + Math.sin(p.phase) * 0.14;
      p.y -= p.vy;

      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < REPEL_RADIUS * REPEL_RADIUS) {
        const dist = Math.sqrt(dist2) || 1;
        const force = ((REPEL_RADIUS - dist) / REPEL_RADIUS) * 1.0;
        p.x += (dx / dist) * force;
        p.y += (dy / dist) * force;
      }

      if (p.y < -12) {
        p.y = h + 12;
        p.x = Math.random() * w;
      }
      if (p.x < -12) p.x = w + 12;
      else if (p.x > w + 12) p.x = -12;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${base},${(0.06 + p.r * 0.05).toFixed(3)})`;
      ctx.fill();
    }

    if (mouse.x > -5000) {
      ctx.lineWidth = 1;
      for (const p of particles) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < LINK * LINK) {
          const alpha = 0.5 * (1 - Math.sqrt(dist2) / LINK);
          ctx.strokeStyle = `rgba(${base},${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(mouse.x, mouse.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      }
    }

    raf = requestAnimationFrame(step);
  }

  function start() {
    if (!raf) {
      raf = requestAnimationFrame(step);
    }
  }
  function stop() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  }

  resize();
  computeMax();
  seed();
  window.addEventListener("resize", () => {
    resize();
    computeMax();
    seed();
  });
  window.addEventListener("load", computeMax);
  [600, 1500, 3000].forEach((ms) => setTimeout(computeMax, ms));
  window.addEventListener("pointermove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }, { passive: true });
  window.addEventListener("pointerleave", () => {
    mouse.x = -9999;
    mouse.y = -9999;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  });
  start();
}
