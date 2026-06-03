
export const MAX_SELECTION = 2;

export const COUNTRY_COLORS = ["#00dcff", "#ffb400"];

const state = {
  selectedCountries: [],
  year: null,
};

// estado compartilhado das viz
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
      // mantem so dois pais selecionado
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
