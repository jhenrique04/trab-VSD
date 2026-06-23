// dropdown para escolher os paises da comparacao (ate MAX_SELECTION);
// espelha e alimenta o estado compartilhado + desenha a legenda dinamica.
import { COUNTRY_COLORS, getState, subscribe, toggleCountry } from "../../core/state.js?v=s1";

const btn = document.querySelector("#countryPickerBtn");
const menu = document.querySelector("#countryPickerMenu");
const legend = document.querySelector("#selectedLegend");

let countries = []; // [{ iso, name }]
const nameByIso = new Map();

init();

async function init() {
  if (!btn || !menu) {
    return;
  }
  try {
    const rows = await fetch("./data/dev_planet_globe.json").then((r) => r.json());
    for (const r of rows) {
      if (r.iso_code && r.country && !nameByIso.has(r.iso_code)) {
        nameByIso.set(r.iso_code, r.country);
      }
    }
    countries = [...nameByIso]
      .map(([iso, name]) => ({ iso, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  } catch (e) {
    console.error("country-picker: falha ao carregar paises", e);
    return;
  }
  buildMenu();
  wire();
  subscribe(render);
  render(getState());
}

function buildMenu() {
  const rows = countries
    .map(
      (c) =>
        `<label class="country-picker-row"><input type="checkbox" value="${c.iso}" /> <span>${c.name}</span></label>`,
    )
    .join("");
  menu.innerHTML = `
    <input type="search" id="countryPickerSearch" class="country-picker-search" placeholder="Buscar país..." autocomplete="off" />
    <div class="country-picker-list">${rows}</div>`;
}

function wire() {
  btn.addEventListener("click", () => {
    const open = menu.hasAttribute("hidden");
    open ? menu.removeAttribute("hidden") : menu.setAttribute("hidden", "");
    btn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !e.target.closest("#countryPicker")) {
      menu.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
    }
  });
  menu.addEventListener("input", (e) => {
    const s = e.target.closest("#countryPickerSearch");
    if (!s) {
      return;
    }
    const q = s.value.trim().toLowerCase();
    menu.querySelectorAll(".country-picker-row").forEach((row) => {
      row.style.display = row.textContent.trim().toLowerCase().includes(q) ? "" : "none";
    });
  });
  menu.addEventListener("change", (e) => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (cb) {
      toggleCountry(cb.value); // estado aplica FIFO se passar do limite
    }
  });
}

function render(state) {
  const sel = state.selectedCountries;
  const set = new Set(sel);
  menu.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = set.has(cb.value);
  });
  btn.textContent = sel.length ? `${sel.length} selecionado(s) ▾` : "+ Escolher países ▾";
  if (legend) {
    legend.innerHTML = sel.length
      ? sel
          .map(
            (iso, i) =>
              `<span><span class="country-chip" style="background:${COUNTRY_COLORS[i % COUNTRY_COLORS.length]}"></span>${nameByIso.get(iso) || iso}</span>`,
          )
          .join("")
      : "";
  }
}
