// responsavel pelo ato 1: corrida idh x co2 per capita
import { COUNTRY_COLORS, getState, selectionIndex, subscribe, toggleCountry } from "../../core/state.js?v=s1";
import { cssVar } from "../../core/theme.js";

const d3 = window.d3;

const SUSTAINABLE = 2.3;
const MARGIN = { top: 18, right: 22, bottom: 46, left: 56 };

const REGION_COLORS = d3.scaleOrdinal(d3.schemeTableau10);

let rows = [];
let byYear = new Map();
let years = [];
let currentYear = 1990;
let playing = false;
let timer = null;

let container, svg, gPlot, xAxisG, yAxisG, quadrant, quadrantLabel, bubbleG, trailG, yearBadge;
let xScale, yScale, rScale;
let width = 0;
let height = 0;
let tooltip;

export const raceController = { setYear, play, pause, toggle, focusGreen, reset, isReady: () => years.length > 0 };

init();

async function init() {
  container = document.querySelector("#raceGraphic");
  if (!container) {
    return;
  }
  buildSkeleton();

  const payload = await fetch("./data/dev_planet_narrative.json").then((r) => r.json());
  rows = payload.rows.filter(
    (d) =>
      Number.isFinite(d.hdi) &&
      Number.isFinite(d.co2_per_capita) &&
      d.co2_per_capita > 0 &&
      Number.isFinite(d.population) &&
      d.population > 0,
  );
  byYear = d3.group(rows, (d) => d.year);
  years = [...byYear.keys()].sort((a, b) => a - b);
  currentYear = years.includes(1990) ? 1990 : years[0];

  REGION_COLORS.domain([...new Set(rows.map((d) => d.region))]);

  setupScales();
  drawAxes();
  drawQuadrant();
  render();
  wireControls();

  new ResizeObserver(onResize).observe(container);
  window.addEventListener("themechange", applyTheme);
  subscribe(render);
}

function buildSkeleton() {
  container.innerHTML = `
    <div class="race-wrap">
      <svg class="race-svg" id="raceSvg"></svg>
      <div class="race-controls">
        <button class="race-play" id="racePlay" type="button" aria-label="Play">▶</button>
        <span class="race-year" id="raceYear">1990</span>
        <input class="race-slider" id="raceSlider" type="range" min="0" max="0" value="0" />
      </div>
    </div>`;
  svg = d3.select("#raceSvg");
  gPlot = svg.append("g");
  quadrant = gPlot.append("rect").attr("class", "race-quadrant");
  quadrantLabel = gPlot.append("text").attr("class", "race-quadrant-label");
  xAxisG = gPlot.append("g").attr("class", "race-axis");
  yAxisG = gPlot.append("g").attr("class", "race-axis");
  gPlot.append("text").attr("class", "race-x-title");
  gPlot.append("text").attr("class", "race-y-title");
  trailG = gPlot.append("g");
  bubbleG = gPlot.append("g");
  yearBadge = gPlot.append("text").attr("class", "race-year-badge");

  tooltip = d3.select("body").append("div").attr("class", "tooltip").attr("hidden", true);
}

function dims() {
  width = container.clientWidth;
  height = (container.querySelector(".race-wrap")?.clientHeight || container.clientHeight) - 66;
}

function setupScales() {
  dims();
  const w = width - MARGIN.left - MARGIN.right;
  const h = height - MARGIN.top - MARGIN.bottom;
  xScale = d3.scaleLinear().domain([0.25, 1.0]).range([0, w]);
  yScale = d3.scaleLog().domain([0.03, 60]).range([h, 0]).clamp(true);
  rScale = d3.scaleSqrt().domain([0, d3.max(rows, (d) => d.population)]).range([2.5, 42]);
  gPlot.attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
}

function drawAxes() {
  const w = width - MARGIN.left - MARGIN.right;
  const h = height - MARGIN.top - MARGIN.bottom;
  const axisColor = cssVar("--muted");
  const textColor = cssVar("--text");

  xAxisG
    .attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(xScale).ticks(7))
    .call((g) => g.selectAll("text").attr("fill", axisColor))
    .call((g) => g.selectAll("line,path").attr("stroke", axisColor).attr("stroke-opacity", 0.35));
  yAxisG
    .call(d3.axisLeft(yScale).tickValues([0.05, 0.1, 0.5, 1, 2, 5, 10, 20, 40]).tickFormat(d3.format("~g")))
    .call((g) => g.selectAll("text").attr("fill", axisColor))
    .call((g) => g.selectAll("line,path").attr("stroke", axisColor).attr("stroke-opacity", 0.35));

  gPlot
    .select(".race-x-title")
    .attr("x", w / 2)
    .attr("y", h + 38)
    .attr("text-anchor", "middle")
    .attr("fill", textColor)
    .attr("font-size", 12)
    .attr("font-weight", 600)
    .text("IDH (desenvolvimento humano) →");
  gPlot
    .select(".race-y-title")
    .attr("transform", `translate(${-42},${h / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .attr("fill", textColor)
    .attr("font-size", 12)
    .attr("font-weight", 600)
    .text("CO2 per capita (t, log) →");
}

function drawQuadrant() {
  const x0 = xScale(0.8);
  const wRect = xScale(1.0) - x0;
  const yTop = yScale(SUSTAINABLE);
  const hRect = yScale(0.03) - yTop;
  quadrant
    .attr("x", x0)
    .attr("y", yTop)
    .attr("width", Math.max(0, wRect))
    .attr("height", Math.max(0, hRect))
    .attr("fill", "#2ca25f")
    .attr("fill-opacity", 0.12)
    .attr("stroke", "#2ca25f")
    .attr("stroke-opacity", 0.5)
    .attr("stroke-dasharray", "4 4")
    .attr("rx", 6);
  quadrantLabel
    .attr("x", x0 + 8)
    .attr("y", yTop + 16)
    .attr("fill", "#2ca25f")
    .attr("font-size", 11)
    .attr("font-weight", 700)
    .text("✦ quadrante ideal");
}

function render() {
  if (!years.length) {
    return;
  }
  const data = (byYear.get(currentYear) || []).slice().sort((a, b) => b.population - a.population);
  const selected = getState().selectedCountries;

  // quando esta tocando a transicao fica mais curta para parecer timeline
  const dur = playing ? 240 : 420;

  const bubbles = bubbleG
    .selectAll("circle")
    .data(data, (d) => d.iso_code);
  bubbles
    .join(
      (enter) =>
        enter
          .append("circle")
          .attr("cx", (d) => xScale(d.hdi))
          .attr("cy", (d) => yScale(d.co2_per_capita))
          .attr("r", 0)
          .style("cursor", "pointer")
          .on("mousemove", showTip)
          .on("mouseleave", hideTip)
          .on("click", (_e, d) => toggleCountry(d.iso_code)),
      (update) => update,
      (exit) => exit.transition().duration(dur).attr("r", 0).remove(),
    )
    .attr("fill", (d) => REGION_COLORS(d.region))
    .attr("fill-opacity", (d) => (selected.length && selectionIndex(d.iso_code) < 0 ? 0.28 : 0.78))
    .attr("stroke", (d) => {
      const i = selectionIndex(d.iso_code);
      return i >= 0 ? COUNTRY_COLORS[i] : "rgba(255,255,255,0.35)";
    })
    .attr("stroke-width", (d) => (selectionIndex(d.iso_code) >= 0 ? 3 : 0.6))
    .transition()
    .duration(dur)
    .attr("cx", (d) => xScale(d.hdi))
    .attr("cy", (d) => yScale(d.co2_per_capita))
    .attr("r", (d) => rScale(d.population));

  drawTrails(selected);
  drawSelectedLabels(data, selected);

  yearBadge
    .attr("x", width - MARGIN.left - MARGIN.right - 6)
    .attr("y", height - MARGIN.top - MARGIN.bottom - 8)
    .attr("text-anchor", "end")
    .attr("fill", cssVar("--text"))
    .attr("opacity", 0.18)
    .attr("font-size", 64)
    .attr("font-weight", 800)
    .text(currentYear);

  const yearEl = document.querySelector("#raceYear");
  const slider = document.querySelector("#raceSlider");
  if (yearEl) yearEl.textContent = String(currentYear);
  if (slider) slider.value = String(years.indexOf(currentYear));
}

function drawTrails(selected) {
  // desenha o rastro historico dos paises selecionados ate o ano atual
  const line = d3
    .line()
    .x((d) => xScale(d.hdi))
    .y((d) => yScale(d.co2_per_capita))
    .curve(d3.curveCatmullRom);

  const series = selected.map((iso) =>
    rows
      .filter((d) => d.iso_code === iso && d.year <= currentYear)
      .sort((a, b) => a.year - b.year),
  );

  trailG
    .selectAll("path")
    .data(series)
    .join("path")
    .attr("fill", "none")
    .attr("stroke", (_d, i) => COUNTRY_COLORS[i])
    .attr("stroke-width", 2)
    .attr("stroke-opacity", 0.85)
    .attr("d", (d) => (d.length > 1 ? line(d) : null));
}

function drawSelectedLabels(data, selected) {
  const labels = data.filter((d) => selectionIndex(d.iso_code) >= 0);
  bubbleG
    .selectAll("text.race-dot-label")
    .data(labels, (d) => d.iso_code)
    .join("text")
    .attr("class", "race-dot-label")
    .attr("fill", cssVar("--text"))
    .attr("text-anchor", "middle")
    .attr("x", (d) => xScale(d.hdi))
    .attr("y", (d) => yScale(d.co2_per_capita) - rScale(d.population) - 5)
    .text((d) => d.country);
}

function showTip(event, d) {
  tooltip
    .attr("hidden", null)
    .html(
      `<strong>${d.country}</strong>
       <div class="tooltip-row"><span>Ano</span><span>${currentYear}</span></div>
       <div class="tooltip-row"><span>IDH</span><span>${d.hdi.toFixed(3)}</span></div>
       <div class="tooltip-row"><span>CO2 per capita</span><span>${d.co2_per_capita.toFixed(2)} t</span></div>
       <div class="tooltip-row"><span>Quantas Terras</span><span>${(d.co2_per_capita / SUSTAINABLE).toFixed(1)}×</span></div>`,
    )
    .style("left", `${Math.min(event.clientX + 16, window.innerWidth - 280)}px`)
    .style("top", `${Math.min(event.clientY + 16, window.innerHeight - 160)}px`);
}

function hideTip() {
  tooltip.attr("hidden", true);
}

function wireControls() {
  // a timeline comeca no slider e no botao play do proprio ato 1
  const slider = document.querySelector("#raceSlider");
  slider.max = String(years.length - 1);
  slider.value = String(years.indexOf(currentYear));
  slider.addEventListener("input", () => {
    pause();
    currentYear = years[Number(slider.value)];
    render();
  });
  document.querySelector("#racePlay").addEventListener("click", toggle);
}

function tick() {
  // cada tick avanca para o proximo ano da lista ordenada
  const idx = years.indexOf(currentYear);
  if (idx >= years.length - 1) {
    pause();
    return;
  }
  currentYear = years[idx + 1];
  render();
}

function play() {
  if (playing || !years.length) {
    return;
  }
  if (years.indexOf(currentYear) >= years.length - 1) {
    currentYear = years[0];
  }
  playing = true;
  document.querySelector("#racePlay").textContent = "❚❚";
  // o intervalo eh a animacao temporal da corrida
  timer = setInterval(tick, 650);
}

function pause() {
  playing = false;
  if (timer) clearInterval(timer);
  timer = null;
  const btn = document.querySelector("#racePlay");
  if (btn) btn.textContent = "▶";
}

function toggle() {
  playing ? pause() : play();
}

function setYear(year) {
  if (!years.length) {
    return;
  }
  pause();
  currentYear = years.reduce((best, y) => (Math.abs(y - year) < Math.abs(best - year) ? y : best), years[0]);
  render();
}

function focusGreen() {
  setYear(years.at(-1));
}

function reset() {
  pause();
  currentYear = years[0];
  render();
}

function onResize() {
  if (!years.length) {
    return;
  }
  setupScales();
  drawAxes();
  drawQuadrant();
  render();
}

function applyTheme() {
  if (!years.length) {
    return;
  }
  drawAxes();
  render();
}
