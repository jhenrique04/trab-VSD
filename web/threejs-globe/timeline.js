import { cssVar } from "./theme.js";

const SVGNS = "http://www.w3.org/2000/svg";
const ACTS = [
  { id: "ato1", label: "A corrida" },
  { id: "ato2", label: "Quantas Terras" },
  { id: "ato3", label: "O mapa que mente" },
];

const narrative = document.querySelector(".narrative");
const svg = document.querySelector("#timeline");

if (narrative && svg) {
  let fillPath = null;
  let fillLen = 0;
  let topY = 0;
  let bottomY = 1;
  let dots = [];
  let narrativeTopDoc = 0;
  let ticking = false;

  function relRect(el, nrect) {
    const r = el.getBoundingClientRect();
    return { x: r.left - nrect.left, right: r.right - nrect.left, cy: r.top - nrect.top + r.height / 2 };
  }

  function build() {
    const nrect = narrative.getBoundingClientRect();
    narrativeTopDoc = nrect.top + window.scrollY;

    const geo = [];
    for (const act of ACTS) {
      const el = document.getElementById(act.id);
      if (!el) continue;
      const graphic = el.querySelector(".scrolly-graphic");
      const stepsEl = el.querySelector(".scrolly-steps");
      if (!graphic || !stepsEl) continue;
      const steps = [...stepsEl.querySelectorAll(".step")];
      if (!steps.length) continue;
      const gr = relRect(graphic, nrect);
      const sr = relRect(stepsEl, nrect);
      const sideBySide = sr.x >= gr.right - 8 || gr.x >= sr.right - 8;
      const gLeft = gr.x < sr.x;
      let x;
      if (sideBySide) {
        x = gLeft ? (gr.right + sr.x) / 2 : (sr.right + gr.x) / 2;
      } else {
        x = 12;
      }
      const ys = steps.map((s) => relRect(s, nrect).cy);
      geo.push({ x, ys, label: act.label, gLeft, sideBySide });
    }
    if (!geo.length) return;

    const W = narrative.clientWidth;
    const H = narrative.scrollHeight;
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = "";

    const accent = cssVar("--accent") || "#73d2ff";
    const track = `color-mix(in srgb, ${accent} 26%, transparent)`;
    const panel = cssVar("--panel-solid") || "#0b1422";

    let d = `M ${geo[0].x} ${geo[0].ys[0]}`;
    geo.forEach((a, i) => {
      d += ` L ${a.x} ${a.ys[a.ys.length - 1]}`;
      const next = geo[i + 1];
      if (next) {
        const y1 = a.ys[a.ys.length - 1];
        const y2 = next.ys[0];
        const cross = Math.min(350, (y2 - y1) * 0.5);
        const yc = y1 + cross;
        d += ` C ${a.x} ${y1 + cross * 0.42} ${next.x} ${yc - cross * 0.42} ${next.x} ${yc}`;
        d += ` L ${next.x} ${y2}`;
      }
    });
    topY = geo[0].ys[0];
    bottomY = geo[geo.length - 1].ys[geo[geo.length - 1].ys.length - 1];

    const trackPath = document.createElementNS(SVGNS, "path");
    trackPath.setAttribute("d", d);
    trackPath.setAttribute("fill", "none");
    trackPath.setAttribute("stroke", track);
    trackPath.setAttribute("stroke-width", "3");
    svg.appendChild(trackPath);

    fillPath = document.createElementNS(SVGNS, "path");
    fillPath.setAttribute("d", d);
    fillPath.setAttribute("fill", "none");
    fillPath.setAttribute("stroke", accent);
    fillPath.setAttribute("stroke-width", "3.5");
    fillPath.setAttribute("stroke-linecap", "round");
    svg.appendChild(fillPath);
    fillLen = fillPath.getTotalLength();
    fillPath.style.strokeDasharray = `${fillLen}`;
    fillPath.style.strokeDashoffset = `${fillLen}`;

    dots = [];
    for (const a of geo) {
      a.ys.forEach((y, i) => {
        const milestone = i === 0;
        const c = document.createElementNS(SVGNS, "circle");
        c.setAttribute("cx", a.x);
        c.setAttribute("cy", y);
        c.setAttribute("r", milestone ? 9 : 4.5);
        c.setAttribute("stroke", milestone ? accent : track);
        c.setAttribute("stroke-width", milestone ? 3 : 2);
        c.setAttribute("fill", panel);
        svg.appendChild(c);
        dots.push({ el: c, y, milestone });
      });
      const t = document.createElementNS(SVGNS, "text");
      t.setAttribute("x", a.x);
      t.setAttribute("y", a.ys[0] - 175);
      t.setAttribute("fill", accent);
      t.setAttribute("font-size", "11.5");
      t.setAttribute("font-weight", "800");
      t.setAttribute("letter-spacing", "0.07em");
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dominant-baseline", "middle");
      t.textContent = a.label.toUpperCase();
      svg.appendChild(t);
      const bb = t.getBBox();
      const cpx = 9;
      const cpy = 5;
      const chip = document.createElementNS(SVGNS, "rect");
      chip.setAttribute("x", bb.x - cpx);
      chip.setAttribute("y", bb.y - cpy);
      chip.setAttribute("width", bb.width + cpx * 2);
      chip.setAttribute("height", bb.height + cpy * 2);
      chip.setAttribute("rx", (bb.height + cpy * 2) / 2);
      chip.setAttribute("fill", panel);
      chip.setAttribute("stroke", `color-mix(in srgb, ${accent} 40%, transparent)`);
      chip.setAttribute("stroke-width", "1.5");
      svg.insertBefore(chip, t);
    }
    update();
  }

  function update() {
    if (!fillPath) return;
    const focusY = window.scrollY + window.innerHeight * 0.5 - narrativeTopDoc;
    const frac = Math.max(0, Math.min(1, (focusY - topY) / (bottomY - topY || 1)));
    fillPath.style.strokeDashoffset = `${fillLen * (1 - frac)}`;

    const accent = cssVar("--accent") || "#73d2ff";
    const track = `color-mix(in srgb, ${accent} 26%, transparent)`;
    const panel = cssVar("--panel-solid") || "#0b1422";
    for (const dot of dots) {
      const on = dot.y <= focusY;
      dot.el.setAttribute("fill", on ? accent : panel);
      dot.el.setAttribute("stroke", on || dot.milestone ? accent : track);
    }
  }

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          update();
          ticking = false;
        });
      }
    },
    { passive: true },
  );
  window.addEventListener("resize", build);
  window.addEventListener("themechange", build);
  window.addEventListener("load", build);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(build);
  }
  [400, 1000, 2000, 3500].forEach((ms) => setTimeout(build, ms));
  build();
}
