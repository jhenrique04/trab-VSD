// responsavel pelo ato 5: mapa 2d coropletico dos indicadores
import { COUNTRY_COLORS, getState, selectionIndex, subscribe, toggleCountry } from "../../core/state.js?v=s2";
import { cssVar } from "../../core/theme.js";
import { playFade } from "../../core/fx.js";

const d3 = window.d3;

const INDICATORS = {
  hdi: { label: "IDH", decimals: 3, colors: ["#f7fcb9", "#31a354"] },
  co2_per_capita: { label: "CO2 per capita", decimals: 2, colors: ["#ffffb2", "#bd0026"] },
  gdp_per_capita_ppp_constant: { label: "PIB per capita PPP", decimals: 0, colors: ["#deebf7", "#08519c"] },
  life_expectancy: { label: "Expectativa de vida", decimals: 1, colors: ["#fff7bc", "#2b8cbe"] },
  mean_years_schooling: { label: "Escolaridade média", decimals: 1, colors: ["#edf8fb", "#006d2c"] },
  population: { label: "População", decimals: 0, colors: ["#fee8c8", "#7f0000"] },
  development_carbon_profile: { label: "Perfil desenvolvimento-carbono", categorical: true },
};

const PROFILE_COLORS = {
  "Alto desenvolvimento / baixa emissão": "#2ca25f",
  "Alto desenvolvimento / alta emissão": "#de2d26",
  "Baixo desenvolvimento / baixa emissão": "#74a9cf",
  "Baixo desenvolvimento / alta emissão": "#fdae61",
  "Dados insuficientes": "#8b95a5",
};

let mapEl, indicatorSelect, legendEl;
let geo = null;
let dataByYear = new Map();
let indicator = "co2_per_capita";
let svg, gMap, projection, path, tooltip;
let started = false;

export function initMap2d() {
  if (started) {
    return;
  }
  started = true;
  boot();
}

async function boot() {
  mapEl = document.querySelector("#map2d");
  indicatorSelect = document.querySelector("#map2dIndicator");
  legendEl = document.querySelector("#map2dLegend");
  if (!mapEl) {
    return;
  }

  const [rows, world] = await Promise.all([
    fetch("./data/dev_planet_globe.json").then((r) => r.json()),
    fetch("./data/world.geojson").then((r) => r.json()),
  ]);
  geo = world;
  dataByYear = d3.group(rows, (d) => d.year);

  svg = d3.select(mapEl).append("svg").attr("class", "race-svg");
  gMap = svg.append("g");
  tooltip = d3.select("body").append("div").attr("class", "tooltip").attr("hidden", true);

  indicatorSelect.value = indicator;
  indicatorSelect.addEventListener("change", () => {
    indicator = indicatorSelect.value;
    draw();
    playFade(legendEl);
  });

  new ResizeObserver(draw).observe(mapEl);
  subscribe(draw);
  draw();
}

function rowsForYear() {
  const year = getState().year;
  const list = dataByYear.get(year) || dataByYear.get([...dataByYear.keys()].sort((a, b) => b - a)[0]) || [];
  const map = new Map();
  for (const r of list) {
    map.set(r.iso_code, r);
  }
  return map;
}

function draw() {
  if (!geo || !mapEl) {
    return;
  }
  const w = mapEl.clientWidth;
  const h = mapEl.clientHeight || 520;
  svg.attr("width", w).attr("height", h);
  projection = d3.geoNaturalEarth1().fitSize([w, h - 8], geo);
  path = d3.geoPath(projection);

  const rowMap = rowsForYear();
  const config = INDICATORS[indicator];
  const missing = cssVar("--missing") || "#888";
  const stroke = cssVar("--bg") || "#07111f";

  let colorOf;
  if (config.categorical) {
    colorOf = (r) => PROFILE_COLORS[r?.development_carbon_profile] || missing;
    legendCategorical();
  } else {
    const values = [...rowMap.values()].map((r) => r[indicator]).filter(Number.isFinite);
    const min = d3.min(values);
    const max = d3.max(values);
    const scale = d3.scaleLinear().domain([min, max]).range(config.colors).interpolate(d3.interpolateRgb);
    colorOf = (r) => (Number.isFinite(r?.[indicator]) ? scale(r[indicator]) : missing);
    legendGradient(min, max, config);
  }

  const sel = getState().selectedCountries;
  gMap
    .selectAll("path")
    .data(geo.features, (f) => f.properties.iso_code)
    .join("path")
    .attr("d", path)
    .attr("stroke-width", (f) => (selectionIndex(f.properties.iso_code) >= 0 ? 2 : 0.4))
    .attr("stroke", (f) => {
      const i = selectionIndex(f.properties.iso_code);
      return i >= 0 ? COUNTRY_COLORS[i] : stroke;
    })
    .style("cursor", "pointer")
    .on("mousemove", showTip)
    .on("mouseleave", () => tooltip.attr("hidden", true))
    .on("click", (_e, f) => toggleCountry(f.properties.iso_code))
    .transition()
    .duration(350)
    .attr("fill", (f) => colorOf(rowMap.get(f.properties.iso_code)));
}

function showTip(event, f) {
  const r = rowsForYear().get(f.properties.iso_code);
  const name = r?.country || f.properties.name || f.properties.iso_code;
  const config = INDICATORS[indicator];
  let valueLine;
  if (config.categorical) {
    valueLine = r?.development_carbon_profile || "Dados insuficientes";
  } else {
    const v = r?.[indicator];
    valueLine = Number.isFinite(v) ? format(v, config) : "Sem dado";
  }
  tooltip
    .attr("hidden", null)
    .html(
      `<strong>${name}</strong>
       <div class="tooltip-row"><span>${config.label}</span><span>${valueLine}</span></div>
       <div class="tooltip-row"><span>IDH</span><span>${Number.isFinite(r?.hdi) ? r.hdi.toFixed(3) : "-"}</span></div>
       <div class="tooltip-row"><span>CO2 per capita</span><span>${Number.isFinite(r?.co2_per_capita) ? r.co2_per_capita.toFixed(2) + " t" : "-"}</span></div>`,
    )
    .style("left", `${Math.min(event.clientX + 16, window.innerWidth - 260)}px`)
    .style("top", `${Math.min(event.clientY + 16, window.innerHeight - 140)}px`);
}

function format(v, config) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: config.decimals,
    minimumFractionDigits: indicator === "hdi" ? 3 : 0,
  }).format(v);
}

function legendGradient(min, max, config) {
  if (!legendEl) {
    return;
  }
  const [c0, c1] = config.colors;
  legendEl.innerHTML = `
    <div class="gradient-legend">
      <div class="gradient-bar" style="background:linear-gradient(90deg, ${c0}, ${c1})"></div>
      <div class="legend-scale"><span>${Number.isFinite(min) ? format(min, config) : "-"}</span><span>${Number.isFinite(max) ? format(max, config) : "-"}</span></div>
      <div class="category-item"><span class="swatch" style="background:${cssVar("--missing")}"></span><span>Sem dados</span></div>
    </div>`;
}

function legendCategorical() {
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
