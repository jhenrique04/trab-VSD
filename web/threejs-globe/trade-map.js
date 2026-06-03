import { cssVar } from "./theme.js";
import { playFade } from "./fx.js";

const d3 = window.d3;

const mapEl = document.querySelector("#tradeMap");
const yearLabel = document.querySelector("#tradeYearLabel");
const seg = document.querySelector("#tradeSeg");
const netBarsEl = document.querySelector("#tradeNetBars");
const netBarsChartEl = document.querySelector("#tradeNetBarsChart");

let geo = null;
let rowsByIso = new Map();
let allRows = [];
let year = null;
let mode = "co2_per_capita";
let svg, gMap, projection, path, tooltip, colorScale;

export const tradeController = { setMode, showNetBars, isReady: () => !!geo };

init();

async function init() {
  if (!mapEl) {
    return;
  }
  const [narrative, world] = await Promise.all([
    fetch("./data/dev_planet_narrative.json").then((r) => r.json()),
    fetch("./data/world.geojson").then((r) => r.json()),
  ]);
  geo = world;
  allRows = narrative.rows;

  year = pickYear(allRows);
  indexYear();
  if (yearLabel) {
    yearLabel.textContent = `Dados de ${year} · t CO2 per capita`;
  }

  buildSvg();
  draw();
  wireSeg();

  let resizeTimer = null;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => draw(false), 120);
  }).observe(mapEl);
  window.addEventListener("themechange", () => draw(false));
}

function pickYear(rows) {
  const counts = new Map();
  for (const r of rows) {
    if (Number.isFinite(r.consumption_co2_per_capita)) {
      counts.set(r.year, (counts.get(r.year) || 0) + 1);
    }
  }
  let best = 2021;
  let bestN = -1;
  for (const [y, n] of counts) {
    if (n >= 60 && y >= best) {
      best = y;
      bestN = n;
    }
  }
  return bestN > 0 ? best : 2021;
}

function indexYear() {
  rowsByIso = new Map();
  for (const r of allRows) {
    if (r.year === year) {
      rowsByIso.set(r.iso_code, r);
    }
  }
}

function buildSvg() {
  svg = d3.select(mapEl).append("svg").attr("class", "race-svg");
  gMap = svg.append("g");
  tooltip = d3.select("body").append("div").attr("class", "tooltip").attr("hidden", true);
}

function draw(animate = false) {
  if (!geo || mapEl.hidden) {
    return;
  }
  const w = mapEl.clientWidth;
  const h = mapEl.clientHeight || 520;
  svg.attr("width", w).attr("height", h);

  projection = d3.geoNaturalEarth1().fitSize([w, h - 10], geo);
  path = d3.geoPath(projection);

  const values = geo.features
    .map((f) => rowsByIso.get(f.properties.iso_code)?.[mode])
    .filter((v) => Number.isFinite(v));
  const hi = d3.quantile(values.slice().sort(d3.ascending), 0.96) || d3.max(values) || 1;
  colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, hi]);

  const missing = cssVar("--missing") || "#888";
  const stroke = cssVar("--bg") || "#07111f";

  const fillFor = (f) => {
    const v = rowsByIso.get(f.properties.iso_code)?.[mode];
    return Number.isFinite(v) ? colorScale(v) : missing;
  };
  const sel = gMap
    .selectAll("path")
    .data(geo.features, (f) => f.properties.iso_code)
    .join("path")
    .attr("d", path)
    .attr("stroke", stroke)
    .attr("stroke-width", 0.4)
    .on("mousemove", showTip)
    .on("mouseleave", () => tooltip.attr("hidden", true));
  (animate ? sel.transition().duration(450) : sel).attr("fill", fillFor);
}

function showTip(event, f) {
  const r = rowsByIso.get(f.properties.iso_code);
  const terr = r?.co2_per_capita;
  const cons = r?.consumption_co2_per_capita;
  const name = r?.country || f.properties.name || f.properties.iso_code;
  tooltip
    .attr("hidden", null)
    .html(
      `<strong>${name}</strong>
       <div class="tooltip-row"><span>Território</span><span>${fmt(terr)} t</span></div>
       <div class="tooltip-row"><span>Consumo</span><span>${fmt(cons)} t</span></div>`,
    )
    .style("left", `${Math.min(event.clientX + 16, window.innerWidth - 240)}px`)
    .style("top", `${Math.min(event.clientY + 16, window.innerHeight - 120)}px`);
}

function fmt(v) {
  return Number.isFinite(v) ? v.toFixed(2) : "sem dado";
}

function wireSeg() {
  if (!seg) {
    return;
  }
  seg.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-mode]");
    if (btn) {
      setMode(btn.dataset.mode);
    }
  });
}

function showMap() {
  const wasHidden = mapEl && mapEl.hidden;
  if (mapEl) mapEl.hidden = false;
  if (netBarsEl) netBarsEl.hidden = true;
  if (wasHidden) {
    playFade(mapEl);
  }
}

function setMode(nextMode) {
  if (!["co2_per_capita", "consumption_co2_per_capita"].includes(nextMode)) {
    return;
  }
  showMap();
  if (nextMode === mode) {
    return;
  }
  mode = nextMode;
  if (seg) {
    seg.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === mode));
  }
  draw(true);
}

function showNetBars() {
  if (!netBarsEl) {
    return;
  }
  if (mapEl) mapEl.hidden = true;
  netBarsEl.hidden = false;
  playFade(netBarsEl);
  if (netBarsEl.dataset.rendered === "1") {
    return;
  }
  const ranked = [...rowsByIso.values()]
    .filter((r) => Number.isFinite(r.net_imported_co2))
    .sort((a, b) => b.net_imported_co2 - a.net_imported_co2);
  const top = ranked.slice(0, 8);
  const bottom = ranked.slice(-8);
  const values = [...top, ...bottom].map((r) => ({
    country: r.country,
    net: r.net_imported_co2,
    tipo: r.net_imported_co2 >= 0 ? "Importa carbono" : "Exporta carbono",
  }));

  const spec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: "container",
    height: 320,
    data: { values },
    mark: { type: "bar" },
    encoding: {
      y: { field: "country", type: "nominal", sort: "-x", title: null },
      x: { field: "net", type: "quantitative", title: "CO2 líquido importado (Mt) - negativo = exporta" },
      color: {
        field: "tipo",
        type: "nominal",
        scale: { domain: ["Importa carbono", "Exporta carbono"], range: ["#de2d26", "#2c7fb8"] },
        legend: { orient: "top", title: null },
      },
      tooltip: [
        { field: "country", title: "País" },
        { field: "net", title: "Net (Mt)", format: ",.0f" },
      ],
    },
  };
  window
    .vegaEmbed(netBarsChartEl, spec, {
      actions: false,
      renderer: "svg",
      config: {
        background: "transparent",
        axis: { labelColor: cssVar("--muted"), titleColor: cssVar("--muted"), gridColor: "rgba(150,150,150,0.15)" },
        legend: { labelColor: cssVar("--text"), titleColor: cssVar("--text") },
        view: { stroke: "transparent" },
      },
    })
    .then(() => {
      netBarsEl.dataset.rendered = "1";
    })
    .catch((e) => {
      netBarsEl.innerHTML = `<p class="cmp-note">Falha ao renderizar: ${e.message}</p>`;
    });
}
