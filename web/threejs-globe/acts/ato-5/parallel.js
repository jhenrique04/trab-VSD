// responsavel pelo ato 5: coordenadas paralelas com brush
import { COUNTRY_COLORS, getState, selectionIndex, subscribe, toggleCountry } from "../../core/state.js?v=s1";
import { cssVar } from "../../core/theme.js";

const d3 = window.d3;

const DIMS = [
  { key: "hdi", label: "IDH" },
  { key: "life_expectancy", label: "Expect. de vida" },
  { key: "mean_years_schooling", label: "Escolaridade" },
  { key: "gdp_per_capita_ppp_constant", label: "PIB/cap (PPP)" },
  { key: "co2_per_capita", label: "CO2/cap (t)" },
];

const PROFILE_COLORS = {
  "Alto desenvolvimento / baixa emissão": "#2ca25f",
  "Alto desenvolvimento / alta emissão": "#de2d26",
  "Baixo desenvolvimento / baixa emissão": "#74a9cf",
  "Baixo desenvolvimento / alta emissão": "#fdae61",
  "Dados insuficientes": "#8b95a5",
};

const MARGIN = { top: 30, right: 26, bottom: 18, left: 26 };

const container = document.querySelector("#parallel");
const legendEl = document.querySelector("#parallelLegend");

let rows = [];
let byYear = new Map();
let svg, gPlot, gHalo, tooltip;
let x, yScales;
const brushes = {};
let started = false;

export function initParallel() {
  if (started) {
    return;
  }
  started = true;
  boot();
}

async function boot() {
  if (!container) {
    return;
  }
  rows = await fetch("./data/dev_planet_globe.json").then((r) => r.json());
  byYear = d3.group(rows, (d) => d.year);

  svg = d3.select(container).append("svg").attr("class", "race-svg");
  gPlot = svg.append("g");
  gHalo = gPlot.append("g").attr("class", "pc-halos"); // fica ATRÁS das linhas
  tooltip = d3.select("body").append("div").attr("class", "tooltip").attr("hidden", true);

  renderLegend();
  new ResizeObserver(draw).observe(container);
  window.addEventListener("themechange", () => {
    renderLegend();
    draw();
  });
  subscribe(draw);
  draw();
}

function currentData() {
  const year = getState().year || d3.max([...byYear.keys()]);
  const list = byYear.get(year) || [];
  return list.filter((d) => DIMS.every((dim) => Number.isFinite(d[dim.key])));
}

function draw() {
  if (!svg) {
    return;
  }
  const w = container.clientWidth;
  const h = container.clientHeight || 420;
  svg.attr("width", w).attr("height", h);
  const innerW = w - MARGIN.left - MARGIN.right;
  const innerH = h - MARGIN.top - MARGIN.bottom;
  gPlot.attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  const data = currentData();
  x = d3.scalePoint().domain(DIMS.map((d) => d.key)).range([0, innerW]);
  yScales = {};
  for (const dim of DIMS) {
    yScales[dim.key] = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => d[dim.key]))
      .nice()
      .range([innerH, 0]);
  }

  const axisColor = cssVar("--muted");
  const textColor = cssVar("--text");
  const line = (d) => d3.line()(DIMS.map((dim) => [x(dim.key), yScales[dim.key](d[dim.key])]));

  const sel = getState().selectedCountries;
  const selSet = new Set(sel);

  // halo na cor de SELEÇÃO por baixo: mostra qual país foi escolhido sem
  // repintar a linha (que fica na cor de PERFIL, mantendo a legenda coerente).
  const haloData = sel.map((iso) => data.find((d) => d.iso_code === iso)).filter(Boolean);
  gHalo
    .selectAll("path")
    .data(haloData, (d) => d.iso_code)
    .join("path")
    .attr("fill", "none")
    .attr("d", line)
    .attr("stroke", (d) => COUNTRY_COLORS[selectionIndex(d.iso_code)])
    .attr("stroke-width", 8)
    .attr("stroke-opacity", 0.35)
    .attr("stroke-linecap", "round")
    .attr("pointer-events", "none");

  const lines = gPlot.selectAll("path.pc-line").data(data, (d) => d.iso_code);
  lines
    .join("path")
    .attr("class", "pc-line")
    .attr("fill", "none")
    .attr("d", line)
    // cor SEMPRE por perfil → a legenda "Perfil" continua explicando o gráfico
    .attr("stroke", (d) => PROFILE_COLORS[d.development_carbon_profile] || "#8b95a5")
    .attr("stroke-width", (d) => (selSet.has(d.iso_code) ? 3.5 : 1))
    // fade mais suave: o leque de perfis continua visível quando há seleção
    .attr("stroke-opacity", (d) => (selSet.size ? (selSet.has(d.iso_code) ? 1 : 0.3) : 0.42))
    .style("cursor", "pointer")
    .on("mousemove", showTip)
    .on("mouseleave", () => tooltip.attr("hidden", true))
    .on("click", (_e, d) => toggleCountry(d.iso_code));

  const axisG = gPlot.selectAll("g.pc-axis").data(DIMS, (d) => d.key);
  const axisEnter = axisG.enter().append("g").attr("class", "pc-axis");
  axisEnter.append("g").attr("class", "pc-axis-call");
  axisEnter.append("text").attr("class", "pc-axis-title");
  axisEnter.append("g").attr("class", "pc-brush");
  const axisAll = axisEnter.merge(axisG).attr("transform", (d) => `translate(${x(d.key)},0)`);

  axisAll
    .select(".pc-axis-call")
    .each(function (d) {
      d3.select(this).call(d3.axisLeft(yScales[d.key]).ticks(5));
    })
    .call((g) => g.selectAll("text").attr("fill", axisColor).attr("font-size", 10))
    .call((g) => g.selectAll("line,path").attr("stroke", axisColor).attr("stroke-opacity", 0.3));

  axisAll
    .select(".pc-axis-title")
    .attr("y", -12)
    .attr("text-anchor", "middle")
    .attr("fill", textColor)
    .attr("font-size", 11)
    .attr("font-weight", 700)
    .text((d) => d.label);

  axisAll.select(".pc-brush").each(function (d) {
    const brush = d3
      .brushY()
      .extent([
        [-9, 0],
        [9, innerH],
      ])
      .on("brush end", (event) => onBrush(event, d.key));
    d3.select(this).call(brush);
  });
}

function onBrush(event, key) {
  brushes[key] = event.selection;
  applyBrushFilter();
}

function applyBrushFilter() {
  const active = Object.entries(brushes).filter(([, sel]) => sel);
  gPlot.selectAll("path.pc-line").attr("display", (d) => {
    const visible = active.every(([key, sel]) => {
      const v = yScales[key](d[key]);
      return v >= sel[0] && v <= sel[1];
    });
    return visible ? null : "none";
  });
}

function showTip(event, d) {
  tooltip
    .attr("hidden", null)
    .html(
      `<strong>${d.country}</strong>
       <div class="tooltip-row"><span>IDH</span><span>${d.hdi.toFixed(3)}</span></div>
       <div class="tooltip-row"><span>CO2/cap</span><span>${d.co2_per_capita.toFixed(2)} t</span></div>
       <div class="tooltip-row"><span>Perfil</span><span>${d.development_carbon_profile || "-"}</span></div>`,
    )
    .style("left", `${Math.min(event.clientX + 14, window.innerWidth - 250)}px`)
    .style("top", `${Math.min(event.clientY + 14, window.innerHeight - 130)}px`);
}

function renderLegend() {
  if (!legendEl) {
    return;
  }
  legendEl.innerHTML = `<div class="category-list">${Object.entries(PROFILE_COLORS)
    .map(
      ([label, color]) =>
        `<div class="category-item"><span class="swatch" style="background:${color}"></span><span>${label}</span></div>`,
    )
    .join("")}</div>`;
}

if (container && "IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        io.disconnect();
        initParallel();
      }
    },
    { rootMargin: "300px" },
  );
  io.observe(container);
} else {
  initParallel();
}
