// responsavel pelo ato 5: graficos comparativos em vega-lite
import { COUNTRY_COLORS, getState, subscribe } from "../../core/state.js?v=s1";
import { cssVar } from "../../core/theme.js";
import { playFade } from "../../core/fx.js";

const containers = {
  trajectory: document.querySelector("#cmpTrajectory"),
  historical: document.querySelector("#cmpHistorical"),
  consumption: document.querySelector("#cmpConsumption"),
  dumbbell: document.querySelector("#cmpDumbbell"),
};
const consumptionNote = document.querySelector("#cmpConsumptionNote");
const emptyState = document.querySelector("#comparisonEmpty");

const DUMBBELL_INDICATORS = [
  { key: "hdi", label: "IDH" },
  { key: "life_expectancy", label: "Expect. de vida" },
  { key: "mean_years_schooling", label: "Escolaridade média" },
  { key: "gdp_per_capita_ppp_constant", label: "PIB per capita PPP" },
  { key: "co2_per_capita", label: "CO2 per capita" },
];

function vlConfig() {
  const muted = cssVar("--muted") || "#9fb0c8";
  const text = cssVar("--text") || "#e8eef9";
  return {
    background: "transparent",
    font: "Inter, system-ui, sans-serif",
    axis: {
      labelColor: muted,
      titleColor: text,
      gridColor: "rgba(150,165,190,0.16)",
      domainColor: muted,
      tickColor: muted,
      titleFontWeight: 600,
    },
    legend: { labelColor: text, titleColor: text, orient: "top" },
    view: { stroke: "transparent" },
    title: { color: text, fontSize: 13, anchor: "start", fontWeight: 700 },
  };
}

function embedOpts() {
  return { actions: false, renderer: "svg", config: vlConfig() };
}

let allRows = [];
let dataReady = false;

init();

async function init() {
  try {
    const response = await fetch("./data/dev_planet_globe.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    allRows = await response.json();
    dataReady = true;
    render(getState());
  } catch (error) {
    console.error("Falha ao carregar dados de comparação:", error);
    if (emptyState) {
      emptyState.textContent = `Erro ao carregar dados de comparação: ${error.message}`;
    }
  }
  subscribe(render);
  window.addEventListener("themechange", () => render(getState()));
}

function render(state) {
  if (!dataReady) {
    return;
  }
  const { selectedCountries, year } = state;
  const hasSelection = selectedCountries.length > 0 && year != null;

  emptyState.hidden = hasSelection;
  for (const container of Object.values(containers)) {
    container.closest(".cmp-card").hidden = !hasSelection;
  }
  if (!hasSelection) {
    return;
  }

  const palette = colorScale(selectedCountries, year);
  renderTrajectory(selectedCountries, palette);
  renderHistorical(selectedCountries, year, palette);
  renderConsumption(selectedCountries, year, palette);
  renderDumbbell(selectedCountries, year, palette);
}


function countryName(iso) {
  const row = allRows.find((r) => r.iso_code === iso);
  return row?.country || iso;
}

function colorScale(selectedCountries, year) {
  const domain = selectedCountries.map((iso) => labelFor(iso, year));
  const range = selectedCountries.map((_, index) => COUNTRY_COLORS[index]);
  return { domain, range };
}

function labelFor(iso, _year) {
  return countryName(iso);
}

function rowsForCountry(iso) {
  return allRows.filter((r) => r.iso_code === iso);
}

function rowFor(iso, year) {
  return allRows.find((r) => r.iso_code === iso && r.year === year) || null;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function embed(container, spec) {
  return window
    .vegaEmbed(container, spec, embedOpts())
    .then(() => playFade(container))
    .catch((error) => {
      container.innerHTML = `<p class="cmp-note">Não foi possível renderizar: ${error.message}</p>`;
    });
}

function note(container, message) {
  container.innerHTML = `<p class="cmp-note">${message}</p>`;
}


function renderTrajectory(selectedCountries, palette) {
  const values = [];
  for (const iso of selectedCountries) {
    for (const row of rowsForCountry(iso)) {
      if (isFiniteNumber(row.hdi) && isFiniteNumber(row.co2_per_capita)) {
        values.push({
          pais: countryName(iso),
          year: row.year,
          hdi: row.hdi,
          co2_per_capita: row.co2_per_capita,
        });
      }
    }
  }
  if (!values.length) {
    note(containers.trajectory, "Sem dados de IDH e CO2 para os países selecionados.");
    return;
  }

  const lastYear = Math.max(...values.map((d) => d.year));
  const spec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: "container",
    height: 280,
    data: { values },
    encoding: {
      x: { field: "hdi", type: "quantitative", title: "IDH", scale: { zero: false } },
      y: { field: "co2_per_capita", type: "quantitative", title: "CO2 per capita (t)", scale: { zero: false } },
      color: { field: "pais", type: "nominal", scale: palette, title: null },
    },
    layer: [
      { mark: { type: "line", point: false, opacity: 0.55, interpolate: "monotone" }, encoding: { order: { field: "year" } } },
      {
        mark: { type: "circle", size: 38, opacity: 0.85 },
        encoding: {
          tooltip: [
            { field: "pais", title: "País" },
            { field: "year", title: "Ano" },
            { field: "hdi", title: "IDH", format: ".3f" },
            { field: "co2_per_capita", title: "CO2 pc", format: ".2f" },
          ],
        },
      },
      {
        transform: [{ filter: `datum.year === ${lastYear}` }],
        mark: { type: "point", size: 130, filled: true, stroke: "white", strokeWidth: 1.4 },
      },
      {
        transform: [{ filter: `datum.year === ${lastYear}` }],
        mark: { type: "text", dy: -12, fontWeight: 700, fontSize: 11 },
        encoding: { text: { field: "year" } },
      },
    ],
  };
  embed(containers.trajectory, spec);
}


function renderHistorical(selectedCountries, year, palette) {
  const values = selectedCountries
    .map((iso) => {
      const row = rowFor(iso, year);
      return { pais: countryName(iso), cumulative_co2: row?.cumulative_co2 };
    })
    .filter((d) => isFiniteNumber(d.cumulative_co2));

  if (!values.length) {
    note(containers.historical, "Sem dados de CO2 acumulado para os países selecionados.");
    return;
  }

  const spec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: "container",
    height: 200,
    data: { values },
    mark: { type: "bar", cornerRadiusEnd: 4 },
    encoding: {
      y: { field: "pais", type: "nominal", title: null, sort: "-x" },
      x: { field: "cumulative_co2", type: "quantitative", title: "CO2 acumulado (Mt)" },
      color: { field: "pais", type: "nominal", scale: palette, legend: null },
      tooltip: [
        { field: "pais", title: "País" },
        { field: "cumulative_co2", title: "CO2 acumulado (Mt)", format: ",.0f" },
      ],
    },
  };
  embed(containers.historical, spec);
}


function renderConsumption(selectedCountries, year, palette) {
  consumptionNote.hidden = true;
  const values = [];
  let missing = 0;
  for (const iso of selectedCountries) {
    const row = rowFor(iso, year);
    const name = countryName(iso);
    if (isFiniteNumber(row?.co2_per_capita)) {
      values.push({ pais: name, tipo: "Território (produção)", valor: row.co2_per_capita });
    }
    if (isFiniteNumber(row?.consumption_co2_per_capita)) {
      values.push({ pais: name, tipo: "Consumo", valor: row.consumption_co2_per_capita });
    } else {
      missing += 1;
    }
  }

  if (!values.length) {
    note(containers.consumption, "Sem dados de emissões para os países selecionados neste ano.");
    return;
  }

  const spec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: "container",
    height: 220,
    data: { values },
    mark: { type: "bar" },
    encoding: {
      x: { field: "pais", type: "nominal", title: null },
      xOffset: { field: "tipo" },
      y: { field: "valor", type: "quantitative", title: "CO2 per capita (t)" },
      color: {
        field: "tipo",
        type: "nominal",
        title: null,
        scale: { domain: ["Território (produção)", "Consumo"], range: ["#4f9bd6", "#e07b39"] },
      },
      tooltip: [
        { field: "pais", title: "País" },
        { field: "tipo", title: "Tipo" },
        { field: "valor", title: "t per capita", format: ".2f" },
      ],
    },
  };
  embed(containers.consumption, spec);
  if (missing) {
    consumptionNote.textContent = `Sem dado de consumo para ${missing} país(es) neste ano - barra omitida.`;
    consumptionNote.hidden = false;
  }
}


function renderDumbbell(selectedCountries, year, palette) {
  if (!selectedCountries.length) {
    note(containers.dumbbell, "Selecione um país para comparar com a mediana global.");
    return;
  }

  // com 1 país selecionado, compara ele com a MEDIANA GLOBAL (senão o dumbbell
  // fica com um ponto só e sem informação); com 2+, compara os países entre si.
  const solo = selectedCountries.length === 1;
  const yearRows = allRows.filter((r) => r.year === year);
  const points = [];
  const connectors = [];

  for (const indicator of DUMBBELL_INDICATORS) {
    const all = yearRows.map((r) => r[indicator.key]).filter(isFiniteNumber);
    if (all.length < 2) {
      continue;
    }
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = max - min || 1;
    const norm = (raw) => (isFiniteNumber(raw) ? (raw - min) / span : null);

    const series = selectedCountries.map((iso) => {
      const raw = rowFor(iso, year)?.[indicator.key];
      return { pais: countryName(iso), raw, value: norm(raw) };
    });
    if (solo) {
      const med = median(all);
      series.push({ pais: "Mediana global", raw: med, value: norm(med) });
    }
    if (series.some((d) => d.value === null)) {
      continue;
    }

    for (const entry of series) {
      points.push({ indicador: indicator.label, pais: entry.pais, value: entry.value, raw: entry.raw });
    }
    connectors.push({ indicador: indicator.label, v0: series[0].value, v1: series[1].value });
  }

  if (!points.length) {
    note(containers.dumbbell, "Sem indicadores comparáveis neste ano.");
    return;
  }

  // no modo 1-país, a "Mediana global" entra na paleta em cinza
  const usedPalette = solo
    ? { domain: [palette.domain[0], "Mediana global"], range: [palette.range[0], "#9fb0c8"] }
    : palette;

  const spec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: "container",
    height: 230,
    layer: [
      {
        data: { values: connectors },
        mark: { type: "rule", color: "rgba(159,176,200,0.5)", strokeWidth: 2 },
        encoding: {
          y: { field: "indicador", type: "nominal", title: null },
          x: { field: "v0", type: "quantitative", title: "Posição relativa (0 = menor, 1 = maior)", scale: { domain: [0, 1] } },
          x2: { field: "v1" },
        },
      },
      {
        data: { values: points },
        mark: { type: "circle", size: 150, opacity: 0.95 },
        encoding: {
          y: { field: "indicador", type: "nominal", title: null },
          x: { field: "value", type: "quantitative", scale: { domain: [0, 1] } },
          color: { field: "pais", type: "nominal", scale: usedPalette, title: null },
          tooltip: [
            { field: "pais", title: "País" },
            { field: "indicador", title: "Indicador" },
            { field: "raw", title: "Valor real", format: ".2f" },
            { field: "value", title: "Normalizado", format: ".2f" },
          ],
        },
      },
    ],
  };
  embed(containers.dumbbell, spec);
}
