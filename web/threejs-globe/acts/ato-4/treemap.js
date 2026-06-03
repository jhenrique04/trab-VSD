// responsavel pelo ato 4: treemap de setores e instalacoes
import { getState, subscribe } from "../../core/state.js";
import { cssVar } from "../../core/theme.js";

const d3 = window.d3;

const SECTOR_COLORS = {
  "electricity-generation": "#de2d26",
  "oil-and-gas-production": "#fd8d3c",
  "oil-and-gas-refining": "#feb24c",
  "oil-and-gas-transport": "#ffd282",
  "coal-mining": "#8c5a46",
  "iron-and-steel": "#7878c8",
  cement: "#9e9ac8",
  aluminum: "#5aaacd",
  chemicals: "#bc80bd",
  "petrochemical-steam-cracking": "#9664aa",
  glass: "#78b9be",
  lime: "#b4aacd",
  "pulp-and-paper": "#78af78",
  "copper-mining": "#b47850",
  "iron-mining": "#966e5a",
  "bauxite-mining": "#aa8c64",
  "other-metals": "#82826e",
  "food-beverage-tobacco": "#78b96e",
  "textiles-leather-apparel": "#cda578",
  "other-manufacturing": "#9696a5",
  "other-chemicals": "#aa8cb9",
};
const SECTOR_LABELS = {
  "electricity-generation": "Energia elétrica",
  "oil-and-gas-production": "Petróleo e gás",
  "oil-and-gas-refining": "Refino",
  "oil-and-gas-transport": "Transporte óleo/gás",
  "coal-mining": "Mineração de carvão",
  "iron-and-steel": "Siderurgia",
  cement: "Cimento",
  aluminum: "Alumínio",
  chemicals: "Químicos",
  "petrochemical-steam-cracking": "Petroquímica",
  glass: "Vidro",
  lime: "Cal",
  "pulp-and-paper": "Papel e celulose",
  "copper-mining": "Mineração de cobre",
  "iron-mining": "Mineração de ferro",
  "bauxite-mining": "Mineração de bauxita",
  "other-metals": "Outros metais",
  "food-beverage-tobacco": "Alimentos e bebidas",
  "textiles-leather-apparel": "Têxtil e couro",
  "other-manufacturing": "Outra manufatura",
  "other-chemicals": "Outros químicos",
};
const FACILITIES_PER_SECTOR = 120;

const container = document.querySelector("#treemap");
const titleEl = document.querySelector("#treemapTitle");
const backEl = document.querySelector("#treemapBack");

let allAssets = [];
let svg, tooltip;
let started = false;

let topItems = [];
let topScope = "";
let current = null;

export function initTreemap() {
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
  try {
    allAssets = (await fetch("./data/facilities/facilities_global.json").then((r) => r.json())).assets || [];
  } catch (_) {
    allAssets = [];
  }
  svg = d3.select(container).append("svg").attr("class", "race-svg");
  tooltip = d3.select("body").append("div").attr("class", "tooltip").attr("hidden", true);

  if (backEl) {
    backEl.addEventListener("click", () => render(topItems, topScope, true));
  }
  new ResizeObserver(() => current && render(current.items, current.scope, current.atTop)).observe(container);
  window.addEventListener("themechange", () => current && render(current.items, current.scope, current.atTop));
  subscribe(rebuild);
  rebuild();
}

function rebuild() {
  if (!allAssets.length) {
    return;
  }
  const selSet = new Set(getState().selectedCountries);
  const source = selSet.size ? allAssets.filter((a) => selSet.has(a.iso)) : allAssets;

  const bySector = d3.group(source, (a) => a.sector);
  topItems = [...bySector]
    .map(([sector, assets]) => ({
      name: SECTOR_LABELS[sector] || sector,
      sector,
      value: d3.sum(assets, (a) => a.emissions),
      facilities: assets
        .slice()
        .sort((a, b) => b.emissions - a.emissions)
        .slice(0, FACILITIES_PER_SECTOR)
        .map((a) => ({ name: a.name, sector: a.sector, value: a.emissions })),
    }))
    .sort((a, b) => b.value - a.value);

  topScope = selSet.size ? "Países selecionados" : "Mundo (Climate TRACE)";
  render(topItems, topScope, true);
}

function render(items, scope, atTop) {
  if (!svg || !items.length) {
    return;
  }
  current = { items, scope, atTop };
  if (backEl) {
    backEl.hidden = atTop;
  }

  const w = container.clientWidth;
  const h = container.clientHeight || 360;
  svg.attr("width", w).attr("height", h);

  const total = d3.sum(items, (d) => d.value);
  for (const it of items) {
    it.pct = total ? it.value / total : 0;
  }
  titleEl.textContent = `${scope}: ${fmtBig(total)} CO2e · ${fmt(items.length)} ${atTop ? "setores" : "instalações"}`;

  const root = d3
    .hierarchy({ children: items })
    .sum((d) => d.value)
    .sort((a, b) => b.value - a.value);
  d3.treemap().size([w, h]).paddingInner(2).round(true)(root);

  const stroke = cssVar("--panel-solid") || "#0b1422";

  const cells = svg.selectAll("g.tm-cell").data(root.leaves(), (d) => d.data.name);
  cells.exit().remove();
  const enter = cells.enter().append("g").attr("class", "tm-cell");
  enter.append("rect");
  enter.append("text");
  const all = enter.merge(cells).attr("transform", (d) => `translate(${d.x0},${d.y0})`);

  all
    .select("rect")
    .attr("width", (d) => Math.max(0, d.x1 - d.x0))
    .attr("height", (d) => Math.max(0, d.y1 - d.y0))
    .attr("fill", (d) => SECTOR_COLORS[d.data.sector] || "#9696a5")
    .attr("stroke", stroke)
    .attr("rx", 2)
    .style("cursor", (d) => (atTop && d.data.facilities ? "pointer" : "default"))
    .on("mousemove", (e, d) => showTip(e, d, atTop))
    .on("mouseleave", () => tooltip.attr("hidden", true))
    .on("click", (_e, d) => {
      if (atTop && d.data.facilities) {
        tooltip.attr("hidden", true);
        render(d.data.facilities, `${topScope} › ${d.data.name}`, false);
      }
    });

  all
    .select("text")
    .attr("x", 6)
    .attr("y", 16)
    .attr("fill", "#ffffff")
    .attr("font-size", 11)
    .attr("font-weight", 600)
    .attr("pointer-events", "none")
    .text((d) => ((d.x1 - d.x0) > 56 && (d.y1 - d.y0) > 18 ? labelFor(d, atTop) : ""));
}

function labelFor(d, atTop) {
  const max = atTop ? 22 : 24;
  const name = d.data.name.length > max ? d.data.name.slice(0, max - 1) + "…" : d.data.name;
  const pct = atTop && d.data.pct >= 0.04 ? ` · ${Math.round(d.data.pct * 100)}%` : "";
  return name + pct;
}

function showTip(event, d, atTop) {
  const label = SECTOR_LABELS[d.data.sector] || d.data.sector;
  const extra = atTop && d.data.facilities ? `<div class="tooltip-row"><span></span><span>clique para abrir</span></div>` : "";
  tooltip
    .attr("hidden", null)
    .html(
      `<strong>${d.data.name}</strong>
       <div class="tooltip-row"><span>Setor</span><span>${label}</span></div>
       <div class="tooltip-row"><span>Emissão</span><span>${fmt(d.data.value)} t CO2e</span></div>
       <div class="tooltip-row"><span>% do nível</span><span>${(d.data.pct * 100).toFixed(1)}%</span></div>
       ${extra}`,
    )
    .style("left", `${Math.min(event.clientX + 14, window.innerWidth - 250)}px`)
    .style("top", `${Math.min(event.clientY + 14, window.innerHeight - 130)}px`);
}

function fmt(v) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
}

function fmtBig(t) {
  if (t >= 1e9) {
    return `${(t / 1e9).toFixed(1).replace(".", ",")} Gt`;
  }
  if (t >= 1e6) {
    return `${Math.round(t / 1e6)} Mt`;
  }
  return `${fmt(t)} t`;
}

if (container && "IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        io.disconnect();
        initTreemap();
      }
    },
    { rootMargin: "300px" },
  );
  io.observe(container);
} else {
  initTreemap();
}
