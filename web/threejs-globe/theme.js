const KEY = "devplanet-theme";
const root = document.documentElement;

function label(theme) {
  return theme === "dark" ? "☀︎  Claro" : "🌙  Escuro";
}

function apply(theme, { notify = true } = {}) {
  root.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch (_) {
  }
  const btn = document.querySelector("#themeToggle");
  if (btn) {
    btn.textContent = label(theme);
  }
  if (notify) {
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
  }
}

const stored = (() => {
  try {
    return localStorage.getItem(KEY);
  } catch (_) {
    return null;
  }
})();
const initial =
  stored || (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark");
apply(initial, { notify: false });

document.addEventListener("click", (event) => {
  if (event.target.closest("#themeToggle")) {
    apply(root.dataset.theme === "dark" ? "light" : "dark");
  }
});

export function currentTheme() {
  return root.dataset.theme || "dark";
}

export function cssVar(name) {
  return getComputedStyle(root).getPropertyValue(name).trim();
}
