// responsavel por ler variaveis CSS (usado pelos graficos D3/deck.gl)
const root = document.documentElement;

export function cssVar(name) {
  return getComputedStyle(root).getPropertyValue(name).trim();
}
