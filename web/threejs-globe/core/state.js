// responsavel pelo estado compartilhado de ano e paises selecionados
export const MAX_SELECTION = 5;

export const COUNTRY_COLORS = ["#00dcff", "#ffb400", "#5cff8f", "#ff6ec7", "#b48cff"];

const state = {
  selectedCountries: [],
  year: null,
  sectors: [], // filtro de setores compartilhado (mapa + treemap do Ato 4)
};

const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) {
    listener(state);
  }
}

export function setYear(year) {
  const numericYear = Number(year);
  if (state.year === numericYear) {
    return;
  }
  state.year = numericYear;
  emit();
}

export function toggleCountry(isoCode) {
  if (!isoCode) {
    return;
  }
  const index = state.selectedCountries.indexOf(isoCode);
  if (index >= 0) {
    state.selectedCountries.splice(index, 1);
  } else {
    state.selectedCountries.push(isoCode);
    if (state.selectedCountries.length > MAX_SELECTION) {
      // mantem no maximo MAX_SELECTION paises (descarta o mais antigo)
      state.selectedCountries.shift();
    }
  }
  emit();
}

export function clearCountries() {
  if (!state.selectedCountries.length) {
    return;
  }
  state.selectedCountries = [];
  emit();
}

export function selectionIndex(isoCode) {
  return state.selectedCountries.indexOf(isoCode);
}

// --- filtro de setores compartilhado (Ato 4: mapa + treemap) ---
export function toggleSector(sector) {
  if (!sector) {
    return;
  }
  const index = state.sectors.indexOf(sector);
  if (index >= 0) {
    state.sectors.splice(index, 1);
  } else {
    state.sectors.push(sector);
  }
  emit();
}

export function setSectors(list) {
  state.sectors = [...new Set(list)];
  emit();
}

// define o padrão só se ainda estiver vazio (sem emit: usado antes do 1º render)
export function seedSectors(list) {
  if (!state.sectors.length) {
    state.sectors = [...new Set(list)];
  }
}
