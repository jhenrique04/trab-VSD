// responsavel pelo ato 2: traduz co2 per capita em quantas terras
import { playFade } from "../../core/fx.js";

const SUSTAINABLE = 2.3;
const MAX_GLOBES = 12;

const row = document.querySelector("#earthsRow");
const select = document.querySelector("#footprintSelect");

let latestByIso = new Map();

export const footprintController = { show, isReady: () => latestByIso.size > 0 };

init();

async function init() {
  if (!row || !select) {
    return;
  }
  const payload = await fetch("./data/dev_planet_narrative.json").then((r) => r.json());
  for (const r of payload.rows) {
    if (!Number.isFinite(r.co2_per_capita)) {
      continue;
    }
    const prev = latestByIso.get(r.iso_code);
    if (!prev || r.year > prev.year) {
      latestByIso.set(r.iso_code, r);
    }
  }

  const options = [...latestByIso.values()].sort((a, b) => a.country.localeCompare(b.country));
  select.innerHTML = options
    .map((d) => `<option value="${d.iso_code}">${d.country}</option>`)
    .join("");
  select.addEventListener("change", () => show(select.value));

  show(latestByIso.has("BRA") ? "BRA" : options[0].iso_code);
}

function show(iso) {
  const d = latestByIso.get(iso);
  if (!d) {
    return;
  }
  if (select.value !== iso) {
    select.value = iso;
  }
  const earths = d.co2_per_capita / SUSTAINABLE;
  const whole = Math.min(Math.round(earths), MAX_GLOBES);
  const globes = "🌍".repeat(Math.max(1, whole)) + (earths > MAX_GLOBES ? "…" : "");
  const planeta = earths >= 1.95 ? "planetas" : "planeta";
  row.innerHTML = `
    <div style="color:var(--muted);font-size:0.9rem">Se o mundo inteiro vivesse como</div>
    <div style="font-size:clamp(1.4rem,4vw,2rem);font-weight:800">${d.country}</div>
    <span class="earths-value">${earths.toFixed(1)}×</span>
    <div style="font-size:clamp(1.6rem,6vw,2.6rem);line-height:1.1">${globes}</div>
    <div style="color:var(--muted)">precisaríamos de <strong>${earths.toFixed(1)} ${planeta}</strong> Terra para dar conta do carbono (${d.year}).</div>
  `;
  playFade(row);
}
