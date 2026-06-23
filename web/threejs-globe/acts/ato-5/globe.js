// responsavel pelo ato 5: globos 3d, selecao e sincronizacao
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import ThreeGlobe from "https://cdn.jsdelivr.net/npm/three-globe@2.35.2/+esm";
import {
  COUNTRY_COLORS,
  clearCountries,
  getState,
  selectionIndex,
  setYear,
  subscribe,
  toggleCountry,
} from "../../core/state.js?v=s1";
import { playFade } from "../../core/fx.js";

const tooltip = document.querySelector("#tooltip");
const loading = document.querySelector("#loading");
const yearSelect = document.querySelector("#yearSelect");
const syncCamerasControl = document.querySelector("#syncCameras");
const selectedCountryContent = document.querySelector("#selectedCountryContent");
const clearSelectionButton = document.querySelector("#clearSelection");

const MISSING_COLOR = "rgba(139,149,165,0.62)";
const BORDER_COLOR = "rgba(10, 26, 42, 0.78)";
const NORMAL_SIDE_COLOR = "rgba(18, 27, 42, 0.45)";
const SELECTION_BORDER_COLORS = ["rgba(0, 220, 255, 1)", "rgba(255, 180, 0, 1)"];
const SELECTION_SIDE_COLORS = ["rgba(0, 220, 255, 0.82)", "rgba(255, 180, 0, 0.82)"];
const DRAG_CLICK_THRESHOLD_PX = 6;

const INDICATORS = {
  hdi: { label: "IDH", decimals: 3, colors: ["#f7fcb9", "#31a354"] },
  co2_per_capita: { label: "CO2 per capita", decimals: 2, colors: ["#ffffb2", "#bd0026"] },
  gdp_per_capita_ppp_constant: { label: "PIB per capita PPP", decimals: 0, colors: ["#deebf7", "#08519c"] },
  life_expectancy: { label: "Expectativa de vida", decimals: 1, colors: ["#fff7bc", "#2b8cbe"] },
  mean_years_schooling: { label: "Escolaridade média", decimals: 1, colors: ["#edf8fb", "#006d2c"] },
  expected_years_schooling: { label: "Escolaridade esperada", decimals: 1, colors: ["#edf8fb", "#238443"] },
  population: { label: "População", decimals: 0, colors: ["#fee8c8", "#7f0000"] },
  development_carbon_profile: { label: "Perfil desenvolvimento-carbono", categorical: true },
};

const PROFILE_COLORS = {
  "Alto desenvolvimento / baixa emissão": "#2ca25f",
  "Alto desenvolvimento / alta emissão": "#de2d26",
  "Baixo desenvolvimento / baixa emissão": "#74a9cf",
  "Baixo desenvolvimento / alta emissão": "#fdae61",
  "Dados insuficientes": "#8b95a5",
};

const GLOBE_CONFIGS = [
  {
    id: "left",
    container: document.querySelector("#leftGlobeContainer"),
    indicatorSelect: document.querySelector("#leftIndicatorSelect"),
    indicatorName: document.querySelector("#leftIndicatorName"),
    coverageValue: document.querySelector("#leftCoverageValue"),
    legendContent: document.querySelector("#leftLegendContent"),
  },
  {
    id: "right",
    container: document.querySelector("#rightGlobeContainer"),
    indicatorSelect: document.querySelector("#rightIndicatorSelect"),
    indicatorName: document.querySelector("#rightIndicatorName"),
    coverageValue: document.querySelector("#rightCoverageValue"),
    legendContent: document.querySelector("#rightLegendContent"),
  },
];

let allRows = [];
let worldGeojson = null;
let dataByYear = new Map();
let selectedYear = null;
let hoveredFeature = null;
let pointer = { x: 0, y: 0 };
let globeViews = [];
let syncingCameras = false;
let renderingPaused = false;

window.addEventListener("globes-visible", (event) => {
  renderingPaused = !event.detail?.visible;
});

function featureSelectionIndex(feature) {
  return feature ? selectionIndex(feature.properties.iso_code) : -1;
}

function isFeatureSelected(feature) {
  return featureSelectionIndex(feature) >= 0;
}

function selectedFeatures() {
  if (!worldGeojson) {
    return [];
  }
  return getState()
    .selectedCountries.map((iso) =>
      worldGeojson.features.find((feature) => feature.properties.iso_code === iso),
    )
    .filter(Boolean);
}


init();

async function init() {
  try {
    globeViews = GLOBE_CONFIGS.map(createGlobeView);
    const [rows, geojson] = await Promise.all([
      fetchJson("./data/dev_planet_globe.json"),
      fetchJson("./data/world.geojson"),
    ]);
    allRows = rows;
    worldGeojson = geojson;
    dataByYear = buildYearIndex(allRows);
    setupYearSelect();

    for (const view of globeViews) {
      view.selectedIndicator = view.indicatorSelect.value;
      view.globe.polygonsData(worldGeojson.features);
    }

    updateAllChoropleths();
    setSyncMode();
    resizeAll();
    loading.hidden = true;
    animate();
  } catch (error) {
    loading.textContent = `Erro ao carregar os globos: ${error.message}`;
    console.error(error);
  }
}

function createGlobeView(config) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0a1626");

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 1000);
  camera.position.set(0, 0, 285);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(config.container.clientWidth, config.container.clientHeight);
  config.container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;
  controls.minDistance = 150;
  controls.maxDistance = 430;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;

  scene.add(new THREE.AmbientLight(0xffffff, 1.45));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(120, 90, 160);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.8);
  rimLight.position.set(-160, -80, -120);
  scene.add(rimLight);

  const view = {
    ...config,
    scene,
    camera,
    renderer,
    controls,
    selectedIndicator: config.indicatorSelect.value,
    raycaster: new THREE.Raycaster(),
    pointerNdc: new THREE.Vector2(),
    globeSphere: new THREE.Sphere(new THREE.Vector3(0, 0, 0), 100),
    sphereHit: new THREE.Vector3(),
    clickStart: null,
    hasDraggedPointer: false,
  };

  const globe = new ThreeGlobe({ waitForGlobeReady: true, animateIn: true })
    .globeMaterial(new THREE.MeshPhongMaterial({
      color: 0x12385c,
      emissive: 0x071827,
      emissiveIntensity: 0.42,
      shininess: 8,
      transparent: false,
    }))
    .showAtmosphere(true)
    .atmosphereColor("#6ec6ff")
    .atmosphereAltitude(0.10)
    .polygonSideColor((feature) => polygonSideColor(feature))
    .polygonStrokeColor((feature) => polygonStrokeColor(feature))
    .polygonCapCurvatureResolution(5)
    .polygonAltitude((feature) => polygonAltitude(feature))
    .polygonsTransitionDuration(260);

  view.globe = globe;
  scene.add(globe);
  scene.add(createStars());

  renderer.domElement.addEventListener("pointermove", (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    updateDragState(view, event);
    updateHoverFromPointer(view, event);
    updateTooltip();
  });

  renderer.domElement.addEventListener("pointerleave", () => {
    hoveredFeature = null;
    refreshAllHighlights();
    tooltip.hidden = true;
  });

  renderer.domElement.addEventListener("pointerdown", (event) => {
    view.clickStart = { x: event.clientX, y: event.clientY };
    view.hasDraggedPointer = false;
    stopAutoRotate();
  });
  renderer.domElement.addEventListener("pointercancel", () => {
    view.clickStart = null;
    view.hasDraggedPointer = false;
  });
  renderer.domElement.addEventListener("wheel", stopAutoRotate, { passive: true });

  renderer.domElement.addEventListener("click", (event) => {
    if (view.hasDraggedPointer) {
      view.clickStart = null;
      view.hasDraggedPointer = false;
      return;
    }

    pointer = { x: event.clientX, y: event.clientY };
    const feature = featureFromPointer(view, event) || hoveredFeature;
    if (feature) {
      hoveredFeature = feature;
      toggleCountry(feature.properties.iso_code);
      stopAutoRotate();
    }
    updateTooltip();
    view.clickStart = null;
  });

  config.indicatorSelect.addEventListener("change", () => {
    view.selectedIndicator = config.indicatorSelect.value;
    updateGlobeChoropleth(view);
  });

  controls.addEventListener("change", () => {
    syncCamerasFrom(view);
  });

  return view;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} retornou HTTP ${response.status}`);
  }
  return response.json();
}

function buildYearIndex(rows) {
  const yearMap = new Map();
  for (const row of rows) {
    if (!yearMap.has(row.year)) {
      yearMap.set(row.year, new Map());
    }
    yearMap.get(row.year).set(row.iso_code, row);
  }
  return yearMap;
}

function setupYearSelect() {
  const years = [...dataByYear.keys()].sort((a, b) => a - b);
  yearSelect.innerHTML = "";
  for (const year of years) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    yearSelect.append(option);
  }
  selectedYear = years.includes(2023) ? 2023 : years.at(-1);
  yearSelect.value = String(selectedYear);
  setYear(selectedYear);
}

yearSelect.addEventListener("change", () => {
  selectedYear = Number(yearSelect.value);
  updateAllChoropleths();
  setYear(selectedYear);
});

syncCamerasControl.addEventListener("change", setSyncMode);

clearSelectionButton.addEventListener("click", () => {
  hoveredFeature = null;
  tooltip.hidden = true;
  clearCountries();
  refreshAllHighlights();
  updateSelectionPanel();
});

subscribe(() => {
  refreshAllHighlights();
  updateSelectionPanel();
  updateTooltip();
});


window.addEventListener("resize", resizeAll);

function updateAllChoropleths() {
  for (const view of globeViews) {
    updateGlobeChoropleth(view);
  }
}

function updateGlobeChoropleth(view) {
  if (!worldGeojson) {
    return;
  }

  const currentRows = dataByYear.get(selectedYear) || new Map();
  const values = numericValues(currentRows, view.selectedIndicator);
  const stats = values.length ? extent(values) : { min: null, max: null };
  const coverage = featureCoverage(currentRows, view.selectedIndicator);

  view.indicatorName.textContent = INDICATORS[view.selectedIndicator].label;
  view.coverageValue.textContent = `${coverage} / ${worldGeojson.features.length}`;
  updateLegend(view, stats);

  view.globe
    .polygonCapColor((feature) => colorForFeature(feature, currentRows, stats, view.selectedIndicator))
    .polygonSideColor((feature) => polygonSideColor(feature))
    .polygonStrokeColor((feature) => polygonStrokeColor(feature))
    .polygonAltitude((feature) => polygonAltitude(feature));

  view.globe.polygonsData(worldGeojson.features);
  updateSelectionPanel();
  updateTooltip();
}

function featureCoverage(rowMap, indicator) {
  return worldGeojson.features.filter((feature) => {
    const row = rowMap.get(feature.properties.iso_code);
    if (!row) {
      return false;
    }
    if (INDICATORS[indicator].categorical) {
      return row[indicator] && row[indicator] !== "Dados insuficientes";
    }
    return Number.isFinite(row[indicator]);
  }).length;
}

function numericValues(rowMap, indicator) {
  if (INDICATORS[indicator].categorical) {
    return [...rowMap.values()]
      .filter((row) => row[indicator] && row[indicator] !== "Dados insuficientes")
      .map(() => 1);
  }
  return [...rowMap.values()]
    .map((row) => row[indicator])
    .filter((value) => Number.isFinite(value));
}

function extent(values) {
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function colorForFeature(feature, rowMap, stats, indicator) {
  const isoCode = feature.properties.iso_code;
  const row = rowMap.get(isoCode);
  if (!row) {
    return MISSING_COLOR;
  }

  if (INDICATORS[indicator].categorical) {
    return PROFILE_COLORS[row.development_carbon_profile] || MISSING_COLOR;
  }

  const value = row[indicator];
  if (!Number.isFinite(value) || stats.min === null || stats.max === null) {
    return MISSING_COLOR;
  }
  const t = stats.max === stats.min ? 0.65 : (value - stats.min) / (stats.max - stats.min);
  return interpolateHex(INDICATORS[indicator].colors[0], INDICATORS[indicator].colors[1], clamp(t, 0, 1));
}

function updateLegend(view, stats) {
  if (INDICATORS[view.selectedIndicator].categorical) {
    const items = Object.entries(PROFILE_COLORS)
      .map(([label, color]) => `<div class="category-item"><span class="swatch" style="background:${color}"></span><span>${label}</span></div>`)
      .join("");
    view.legendContent.innerHTML = `<div class="category-list">${items}</div>`;
    return;
  }

  const [start, end] = INDICATORS[view.selectedIndicator].colors;
  const min = stats.min === null ? "-" : formatValue(stats.min, view.selectedIndicator);
  const max = stats.max === null ? "-" : formatValue(stats.max, view.selectedIndicator);
  view.legendContent.innerHTML = `
    <div class="gradient-legend">
      <div class="gradient-bar" style="background:linear-gradient(90deg, ${start}, ${end})"></div>
      <div class="legend-scale"><span>${min}</span><span>${max}</span></div>
      <div class="category-item"><span class="swatch" style="background:${MISSING_COLOR}"></span><span>Sem dados</span></div>
    </div>
  `;
}

function updateTooltip() {
  const activeFeature = hoveredFeature;
  if (!activeFeature) {
    tooltip.hidden = true;
    return;
  }
  tooltip.innerHTML = detailsHtml(activeFeature, featureSelectionIndex(activeFeature));
  tooltip.style.left = `${Math.min(pointer.x + 16, window.innerWidth - 318)}px`;
  tooltip.style.top = `${Math.min(pointer.y + 16, window.innerHeight - 260)}px`;
  tooltip.hidden = false;
}

function updateSelectionPanel() {
  const features = selectedFeatures();
  if (!features.length) {
    selectedCountryContent.textContent =
      "Clique em até dois países no mapa ou nos globos para comparar os detalhes aqui.";
    return;
  }
  selectedCountryContent.innerHTML = features
    .map((feature, index) => `<div class="selected-entry">${detailsHtml(feature, index)}</div>`)
    .join("");
  playFade(selectedCountryContent);
}

function detailsHtml(feature, index = -1) {
  const row = (dataByYear.get(selectedYear) || new Map()).get(feature.properties.iso_code);
  const name = row?.country || feature.properties.name || feature.properties.iso_code;
  const chip =
    index >= 0
      ? `<span class="country-chip" style="background:${COUNTRY_COLORS[index]}"></span>`
      : "";
  return `
    <strong>${chip}${name}</strong>
    ${tooltipRow("Ano", selectedYear)}
    ${tooltipRow("IDH", formatValue(row?.hdi, "hdi"))}
    ${tooltipRow("CO2 per capita", formatValue(row?.co2_per_capita, "co2_per_capita"))}
    ${tooltipRow("CO2 acumulado (Mt)", formatValue(row?.cumulative_co2, "cumulative_co2"))}
    ${tooltipRow("PIB per capita PPP", formatValue(row?.gdp_per_capita_ppp_constant, "gdp_per_capita_ppp_constant"))}
    ${tooltipRow("Expectativa de vida", formatValue(row?.life_expectancy, "life_expectancy"))}
    ${tooltipRow("Escolaridade média", formatValue(row?.mean_years_schooling, "mean_years_schooling"))}
    ${tooltipRow("População", formatValue(row?.population, "population"))}
    ${tooltipRow("Perfil", row?.development_carbon_profile || "Dados insuficientes")}
  `;
}

function updateDragState(view, event) {
  if (!view.clickStart || view.hasDraggedPointer) {
    return;
  }
  const deltaX = event.clientX - view.clickStart.x;
  const deltaY = event.clientY - view.clickStart.y;
  view.hasDraggedPointer = Math.hypot(deltaX, deltaY) > DRAG_CLICK_THRESHOLD_PX;
}

function updateHoverFromPointer(view, event) {
  const feature = featureFromPointer(view, event);
  if (feature !== hoveredFeature) {
    hoveredFeature = feature;
    refreshAllHighlights();
  }
}

function featureFromPointer(view, event) {
  const rect = view.renderer.domElement.getBoundingClientRect();
  view.pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  view.pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  view.raycaster.setFromCamera(view.pointerNdc, view.camera);
  const intersections = view.raycaster.intersectObjects(view.globe.children, true);
  const meshFeature = intersections.map((hit) => findFeatureData(hit.object)).find(Boolean);
  if (meshFeature) {
    return meshFeature;
  }

  // isso eh fallback quando raycast nao acha a malha
  const hitPoint = view.raycaster.ray.intersectSphere(view.globeSphere, view.sphereHit);
  if (!hitPoint) {
    return null;
  }
  const localHitPoint = view.globe.worldToLocal(hitPoint.clone());
  const { lat, lng } = cartesianToGeo(localHitPoint);
  return featureAtLngLat(lng, lat);
}

function polygonAltitude(feature) {
  if (isFeatureSelected(feature)) {
    return 0.075;
  }
  if (feature === hoveredFeature) {
    return 0.024;
  }
  return 0.011;
}

function polygonSideColor(feature) {
  const index = featureSelectionIndex(feature);
  return index >= 0 ? SELECTION_SIDE_COLORS[index] || SELECTION_SIDE_COLORS[0] : NORMAL_SIDE_COLOR;
}

function polygonStrokeColor(feature) {
  const index = featureSelectionIndex(feature);
  return index >= 0 ? SELECTION_BORDER_COLORS[index] || SELECTION_BORDER_COLORS[0] : BORDER_COLOR;
}

function refreshAllHighlights() {
  for (const view of globeViews) {
    view.globe
      .polygonAltitude((feature) => polygonAltitude(feature))
      .polygonSideColor((feature) => polygonSideColor(feature))
      .polygonStrokeColor((feature) => polygonStrokeColor(feature));
  }
}

function findFeatureData(object) {
  let current = object;
  while (current) {
    const data = current.__data || current.__currentTargetD;
    if (data?.properties?.iso_code) {
      return data;
    }
    current = current.parent;
  }
  return null;
}

function cartesianToGeo(point) {
  const radius = Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z);
  const phi = Math.acos(point.y / radius);
  const theta = Math.atan2(point.z, point.x);
  const lat = 90 - (phi * 180) / Math.PI;
  const lng = 90 - (theta * 180) / Math.PI - (theta < -Math.PI / 2 ? 360 : 0);
  return { lat, lng };
}

function featureAtLngLat(lng, lat) {
  if (!worldGeojson?.features?.length) {
    return null;
  }
  return worldGeojson.features.find((feature) => pointInFeature(lng, lat, feature)) || null;
}

function pointInFeature(lng, lat, feature) {
  const geometry = feature.geometry;
  if (!geometry) {
    return false;
  }
  if (geometry.type === "Polygon") {
    return pointInPolygon(lng, lat, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(lng, lat, polygon));
  }
  return false;
}

function pointInPolygon(lng, lat, rings) {
  if (!rings?.length || !pointInRing(lng, lat, rings[0])) {
    return false;
  }
  return !rings.slice(1).some((hole) => pointInRing(lng, lat, hole));
}

function pointInRing(lng, lat, ring) {
  if (!ring?.length) {
    return false;
  }
  const longitudes = ring.map((point) => point[0]);
  const crossesAntimeridian = Math.max(...longitudes) - Math.min(...longitudes) > 180;
  // antimeridiano quebra lng se nao normalizar
  const testLng = crossesAntimeridian ? normalizeAntimeridianLng(lng, lng) : lng;

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = crossesAntimeridian ? normalizeAntimeridianLng(ring[i][0], lng) : ring[i][0];
    const yi = ring[i][1];
    const xj = crossesAntimeridian ? normalizeAntimeridianLng(ring[j][0], lng) : ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > lat !== yj > lat && testLng < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function normalizeAntimeridianLng(value, referenceLng) {
  if (referenceLng < 0 && value > 0) {
    return value - 360;
  }
  if (referenceLng > 0 && value < 0) {
    return value + 360;
  }
  return value;
}

function tooltipRow(label, value) {
  return `<div class="tooltip-row"><span>${label}</span><span>${value ?? "Sem dados"}</span></div>`;
}

function formatValue(value, indicator) {
  if (!Number.isFinite(value)) {
    return "Sem dados";
  }
  const decimals = INDICATORS[indicator]?.decimals ?? 2;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: indicator === "hdi" ? 3 : 0,
  }).format(value);
}

function createStars() {
  const starGeometry = new THREE.BufferGeometry();
  const count = 1200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const radius = 520 + Math.random() * 420;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0xd8e7ff,
    size: 1.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.74,
  });
  return new THREE.Points(starGeometry, starMaterial);
}

function interpolateHex(startHex, endHex, t) {
  const start = hexToRgb(startHex);
  const end = hexToRgb(endHex);
  const r = Math.round(start.r + (end.r - start.r) * t);
  const g = Math.round(start.g + (end.g - start.g) * t);
  const b = Math.round(start.b + (end.b - start.b) * t);
  return `rgb(${r},${g},${b})`;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setSyncMode() {
  if (!globeViews.length) {
    return;
  }
  if (syncCamerasControl.checked) {
    syncCamerasFrom(globeViews[0], true);
  }
}

function syncCamerasFrom(sourceView, force = false) {
  if ((!force && !syncCamerasControl.checked) || syncingCameras || !globeViews.length) {
    return;
  }

  syncingCameras = true;
  for (const targetView of globeViews) {
    if (targetView === sourceView) {
      continue;
    }
    targetView.camera.position.copy(sourceView.camera.position);
    targetView.camera.quaternion.copy(sourceView.camera.quaternion);
    targetView.camera.up.copy(sourceView.camera.up);
    targetView.controls.target.copy(sourceView.controls.target);
    targetView.controls.update();
  }
  syncingCameras = false;
}

function stopAutoRotate() {
  for (const view of globeViews) {
    view.controls.autoRotate = false;
  }
}

function resizeAll() {
  for (const view of globeViews) {
    const width = view.container.clientWidth || 620;
    const height = view.container.clientHeight || 520;
    view.camera.aspect = width / height;
    view.camera.updateProjectionMatrix();
    view.renderer.setSize(width, height);
  }
}

function animate() {
  if (!renderingPaused) {
    for (const view of globeViews) {
      view.controls.update();
      view.renderer.render(view.scene, view.camera);
    }
  }
  requestAnimationFrame(animate);
}
