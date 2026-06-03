// responsavel pelo ato 4: mapa das instalacoes emissoras
import { getState, subscribe } from "../../core/state.js";
import { playFade } from "../../core/fx.js";

const container = document.querySelector("#facilitiesMap");
const legendEl = document.querySelector("#facilitiesLegend");
const statusEl = document.querySelector("#facilitiesStatus");

const SECTOR_COLORS = {
  "electricity-generation": [222, 45, 38],
  "oil-and-gas-production": [253, 141, 60],
  "oil-and-gas-refining": [254, 178, 76],
  "oil-and-gas-transport": [255, 210, 130],
  "coal-mining": [140, 90, 70],
  "iron-and-steel": [120, 120, 200],
  cement: [158, 154, 200],
  aluminum: [90, 170, 205],
  chemicals: [188, 128, 189],
  "petrochemical-steam-cracking": [150, 100, 170],
  glass: [120, 185, 190],
  lime: [180, 170, 205],
  "pulp-and-paper": [120, 175, 120],
  "copper-mining": [180, 120, 80],
  "iron-mining": [150, 110, 90],
  "bauxite-mining": [170, 140, 100],
  "other-metals": [130, 130, 110],
  "food-beverage-tobacco": [120, 185, 110],
  "textiles-leather-apparel": [205, 165, 120],
  "other-manufacturing": [150, 150, 165],
  "other-chemicals": [170, 140, 185],
};
const DEFAULT_SECTOR_COLOR = [150, 150, 165];

const SECTOR_LABELS = {
  "electricity-generation": "Energia elétrica",
  "oil-and-gas-production": "Petróleo e gás (produção)",
  "oil-and-gas-refining": "Refino de petróleo/gás",
  "oil-and-gas-transport": "Transporte de óleo/gás",
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

let allAssets = [];
let maxEmissions = 1;
let deckInstance = null;
let viewState = { longitude: 10, latitude: 25, zoom: 1.1, pitch: 0, bearing: 0 };
let lastKey = null;

function setStatus(text) {
  statusEl.textContent = text;
  playFade(statusEl);
}

if (container && typeof deck !== "undefined") {
  if ("requestIdleCallback" in window) {
    requestIdleCallback(() => init(), { timeout: 2500 });
  } else {
    setTimeout(() => init(), 1200);
  }
}

async function init() {
  if (!container || typeof deck === "undefined") {
    return;
  }
  deckInstance = new deck.DeckGL({
    container,
    controller: true,
    viewState,
    onViewStateChange: ({ viewState: vs }) => {
      viewState = vs;
      deckInstance.setProps({ viewState });
    },
    layers: [basemapLayer()],
    getTooltip: tooltipFor,
  });

  try {
    const payload = await fetch("./data/facilities/facilities_global.json").then((r) => r.json());
    allAssets = payload.assets || [];
  } catch (error) {
    console.warn("facilities_global.json indisponível:", error);
    allAssets = [];
  }
  maxEmissions = allAssets.reduce((m, a) => Math.max(m, a.emissions), 1);

  render(getState());
  subscribe(render);
  window.addEventListener("themechange", () => {
    lastKey = null;
    render(getState());
  });
}

function basemapLayer() {
  const tiles = document.documentElement.dataset.theme === "light" ? "light_all" : "dark_all";
  return new deck.TileLayer({
    id: "basemap",
    data: `https://a.basemaps.cartocdn.com/${tiles}/{z}/{x}/{y}.png`,
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256,
    renderSubLayers: (props) => {
      const { west, south, east, north } = props.tile.bbox;
      return new deck.BitmapLayer(props, { data: null, image: props.data, bounds: [west, south, east, north] });
    },
  });
}

function render(state) {
  if (!deckInstance) {
    return;
  }
  const selected = new Set(state.selectedCountries);
  const hasSel = selected.size > 0;
  const key = `${document.documentElement.dataset.theme}|${[...selected].join(",")}`;
  if (key === lastKey) {
    return;
  }
  lastKey = key;

  if (!allAssets.length) {
    setStatus("Dados de instalações indisponíveis.");
    deckInstance.setProps({ layers: [basemapLayer()] });
    return;
  }

  const scatter = new deck.ScatterplotLayer({
    id: "facilities",
    data: allAssets,
    pickable: true,
    stroked: true,
    filled: true,
    radiusUnits: "pixels",
    radiusMinPixels: 1.5,
    radiusMaxPixels: 34,
    lineWidthMinPixels: 0.4,
    getPosition: (d) => [d.lon, d.lat],
    getRadius: (d) => {
      const base = 2 + 30 * Math.sqrt(d.emissions / maxEmissions);
      return hasSel && selected.has(d.iso) ? base * 1.15 : base;
    },
    getFillColor: (d) => {
      const [r, g, b] = SECTOR_COLORS[d.sector] || DEFAULT_SECTOR_COLOR;
      const alpha = !hasSel || selected.has(d.iso) ? 205 : 28;
      return [r, g, b, alpha];
    },
    getLineColor: (d) => (hasSel && selected.has(d.iso) ? [255, 255, 255, 220] : [10, 16, 26, 120]),
    updateTriggers: {
      getFillColor: [hasSel, [...selected].join(",")],
      getRadius: [hasSel, [...selected].join(",")],
      getLineColor: [hasSel, [...selected].join(",")],
    },
  });

  deckInstance.setProps({ layers: [basemapLayer(), scatter] });

  if (hasSel) {
    flyToSelection(selected);
  } else {
    flyTo({ longitude: 10, latitude: 25, zoom: 1.1 });
  }

  renderLegend(hasSel ? allAssets.filter((a) => selected.has(a.iso)) : allAssets);
  const shown = hasSel ? allAssets.filter((a) => selected.has(a.iso)).length : allAssets.length;
  setStatus(
    hasSel
      ? `${shown} instalações nos países selecionados (Climate TRACE, CO2e).`
      : `${shown} maiores instalações emissoras do mundo (Climate TRACE, CO2e). Selecione países para focar.`,
  );
}

function flyToSelection(selected) {
  const pts = allAssets.filter((a) => selected.has(a.iso));
  if (!pts.length) {
    return;
  }
  const lons = pts.map((a) => a.lon);
  const lats = pts.map((a) => a.lat);
  const west = Math.min(...lons);
  const east = Math.max(...lons);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const span = Math.max(east - west, north - south, 1);
  flyTo({
    longitude: (west + east) / 2,
    latitude: (south + north) / 2,
    zoom: Math.max(1.2, Math.min(6, Math.log2(360 / span))),
  });
}

function flyTo(target) {
  const Fly = deck.FlyToInterpolator;
  viewState = {
    ...viewState,
    ...target,
    pitch: 0,
    bearing: 0,
    transitionDuration: 900,
    transitionInterpolator: Fly ? new Fly({ speed: 1.4 }) : undefined,
  };
  deckInstance.setProps({ viewState });
}

function renderLegend(assets) {
  const counts = new Map();
  for (const a of assets) {
    counts.set(a.sector, (counts.get(a.sector) || 0) + 1);
  }
  const sectors = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  legendEl.innerHTML = sectors
    .map((sector) => {
      const [r, g, b] = SECTOR_COLORS[sector] || DEFAULT_SECTOR_COLOR;
      const label = SECTOR_LABELS[sector] || sector;
      return `<div class="category-item"><span class="swatch" style="background:rgb(${r},${g},${b})"></span><span>${label}</span></div>`;
    })
    .join("");
  playFade(legendEl);
}

function tooltipFor({ object }) {
  if (!object) {
    return null;
  }
  const label = SECTOR_LABELS[object.sector] || object.sector;
  return {
    html: `<strong>${object.name}</strong><br/>${object.iso} · ${label}${object.type ? ` · ${object.type}` : ""}<br/>${formatEmissions(object.emissions)} t CO2e`,
    style: {
      background: "rgba(7,13,22,0.94)",
      color: "#e8eef9",
      fontSize: "12px",
      padding: "8px 10px",
      borderRadius: "6px",
      border: "1px solid rgba(179,205,238,0.36)",
    },
  };
}

function formatEmissions(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}
