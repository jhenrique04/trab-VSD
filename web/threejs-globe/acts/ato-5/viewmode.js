// responsavel pelo ato 5: alterna entre mapa 2d e globos 3d
import { initMap2d } from "./map2d.js";
import { playFade } from "../../core/fx.js";

const KEY = "devplanet-view";
const seg = document.querySelector("#viewSeg");
const view3d = document.querySelector("#view3d");
const view2d = document.querySelector("#view2d");
const ato5 = document.querySelector("#ato5");

let mode = "3d";
let inView = false;

function syncGlobes() {
  // isso eh pra nao gastar gpu fora da tela
  window.dispatchEvent(
    new CustomEvent("globes-visible", { detail: { visible: mode === "3d" && inView } }),
  );
}

function setView(view) {
  mode = view;
  const is2d = view === "2d";
  if (ato5) ato5.dataset.view = view;
  if (view2d) view2d.hidden = !is2d;
  if (view3d) view3d.hidden = is2d;
  playFade(is2d ? view2d : view3d);
  if (seg) {
    seg.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
  }
  if (is2d) {
    // mapa 2d carrega so quando precisa
    initMap2d();
  }
  syncGlobes();
  try {
    localStorage.setItem(KEY, view);
  } catch (_) {
  }
}

if (seg) {
  seg.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-view]");
    if (btn) {
      setView(btn.dataset.view);
    }
  });
}

if (ato5 && "IntersectionObserver" in window) {
  new IntersectionObserver(
    (entries) => {
      inView = entries[0].isIntersecting;
      syncGlobes();
    },
    { rootMargin: "0px", threshold: 0.01 },
  ).observe(ato5);
}

let initial = "2d";
try {
  initial = localStorage.getItem(KEY) || "2d";
} catch (_) {
  initial = "2d";
}
setView(initial);
