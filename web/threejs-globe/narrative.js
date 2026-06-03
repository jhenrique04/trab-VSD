import { raceController } from "./race.js";
import { footprintController } from "./footprint.js";
import { tradeController } from "./trade-map.js";

const scrollers = [];

function makeScroller(selector, onEnter) {
  const steps = document.querySelectorAll(`${selector} .step`);
  if (!steps.length || typeof window.scrollama !== "function") {
    return;
  }
  const scroller = window.scrollama();
  scroller
    .setup({ step: `${selector} .step`, offset: 0.5 })
    .onStepEnter(({ element }) => {
      steps.forEach((s) => s.classList.toggle("is-active", s === element));
      onEnter(element);
    });
  scrollers.push(scroller);
}

function resizeScrollers() {
  scrollers.forEach((s) => s.resize());
}

window.addEventListener("resize", resizeScrollers);

makeScroller("#raceSteps", (el) => {
  if (!raceController.isReady()) {
    return;
  }
  const { action, year } = el.dataset;
  if (action === "reset") {
    raceController.reset();
  } else if (action === "green") {
    raceController.focusGreen();
  } else if (year) {
    raceController.setYear(Number(year));
  }
});

makeScroller("#footprintSteps", (el) => {
  if (el.dataset.iso && footprintController.isReady()) {
    footprintController.show(el.dataset.iso);
  }
});

makeScroller("#tradeSteps", (el) => {
  if (!tradeController.isReady()) {
    return;
  }
  if (el.dataset.action === "netbars") {
    tradeController.setMode("consumption_co2_per_capita");
    tradeController.showNetBars();
  } else if (el.dataset.mode) {
    tradeController.setMode(el.dataset.mode);
  }
});

function alignSteps() {
  let changed = false;
  // alinha os passo com o grafico
  document.querySelectorAll(".scrolly").forEach((scrolly) => {
    const graphic = scrolly.querySelector(".scrolly-graphic");
    const steps = scrolly.querySelector(".scrolly-steps");
    if (!graphic || !steps) {
      return;
    }
    const offset = `${graphic.offsetTop}px`;
    if (steps.style.getPropertyValue("--steps-offset") !== offset) {
      steps.style.setProperty("--steps-offset", offset);
      changed = true;
    }
  });
  if (changed) {
    // scrollama recalcula quando altura muda
    resizeScrollers();
  }
}

window.addEventListener("load", alignSteps);
window.addEventListener("resize", alignSteps);
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(alignSteps);
}
[200, 600, 1200, 2000].forEach((ms) => setTimeout(alignSteps, ms));

if ("ResizeObserver" in window) {
  const ro = new ResizeObserver(() => alignSteps());
  document.querySelectorAll(".scrolly-pin .act-intro, .scrolly-graphic").forEach((el) => ro.observe(el));
}

const navLinks = [...document.querySelectorAll(".topbar-nav a")];
if (navLinks.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          navLinks.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${id}`));
        }
      }
    },
    { rootMargin: "-40% 0px -55% 0px" },
  );
  document.querySelectorAll("main .act").forEach((section) => observer.observe(section));
}
