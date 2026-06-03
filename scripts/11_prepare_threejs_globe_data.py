from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

import pandas as pd
import requests


PROJECT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_DIR / "web" / "threejs-globe" / "data"
GLOBE_JSON_PATH = OUTPUT_DIR / "dev_planet_globe.json"
WORLD_GEOJSON_PATH = OUTPUT_DIR / "world.geojson"

WORLD_ATLAS_URL = "https://cdn.jsdelivr.net/npm/visionscarto-world-atlas@1/world/110m.json"

SOURCE_CANDIDATES = [
    PROJECT_DIR / "data" / "streamlit" / "dev_planet_streamlit_clean.csv",
    PROJECT_DIR / "data" / "tableau" / "dev_planet_tableau_wide.csv",
    PROJECT_DIR / "data" / "processed" / "dev_planet_country_year_wide.csv",
]

START_YEAR = 1990
END_YEAR = 2023
ISO3_RE = re.compile(r"^[A-Z]{3}$")

PROHIBITED_AGGREGATES = {
    "World",
    "Europe",
    "Asia",
    "Africa",
    "High income",
    "Low income",
    "OECD members",
    "European Union",
    "Upper middle income",
    "Lower middle income",
}

GLOBE_COLUMNS = [
    "iso_code",
    "country",
    "year",
    "region",
    "income_group",
    "hdi",
    "co2_per_capita",
    "gdp_per_capita_ppp_constant",
    "life_expectancy",
    "mean_years_schooling",
    "expected_years_schooling",
    "population",
    "cumulative_co2",
    "consumption_co2_per_capita",
    "total_ghg",
    "ghg_per_capita",
    "hdi_to_co2_ratio",
    "co2_per_capita_change_1990_latest",
    "hdi_change_1990_latest",
]

NUMERIC_COLUMNS = [
    "year",
    "hdi",
    "co2_per_capita",
    "gdp_per_capita_ppp_constant",
    "life_expectancy",
    "mean_years_schooling",
    "expected_years_schooling",
    "population",
    "cumulative_co2",
    "consumption_co2_per_capita",
    "total_ghg",
    "ghg_per_capita",
    "hdi_to_co2_ratio",
    "co2_per_capita_change_1990_latest",
    "hdi_change_1990_latest",
]


def first_existing_source() -> Path:
    for path in SOURCE_CANDIDATES:
        if path.exists():
            return path
    searched = "\n".join(str(path) for path in SOURCE_CANDIDATES)
    raise FileNotFoundError(f"No source dataset found. Searched:\n{searched}")


def clean_number(value: Any) -> Any:
    if value is None:
        return None
    if pd.isna(value):
        return None
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        return float(value)
    if isinstance(value, int):
        return int(value)
    return value


def profile_for_row(row: pd.Series, medians: pd.Series) -> str:
    hdi = row.get("hdi")
    co2 = row.get("co2_per_capita")
    median = medians.get(row.get("year"))
    if pd.isna(hdi) or pd.isna(co2) or pd.isna(median):
        return "Dados insuficientes"

    high_development = hdi >= 0.800
    high_emission = co2 >= median
    if high_development and not high_emission:
        return "Alto desenvolvimento / baixa emissão"
    if high_development and high_emission:
        return "Alto desenvolvimento / alta emissão"
    if not high_development and not high_emission:
        return "Baixo desenvolvimento / baixa emissão"
    return "Baixo desenvolvimento / alta emissão"


def prepare_globe_data() -> list[dict[str, Any]]:
    source_path = first_existing_source()
    df = pd.read_csv(source_path, encoding="utf-8", low_memory=False)

    missing = [column for column in GLOBE_COLUMNS if column not in df.columns]
    if missing:
        raise ValueError(f"Source dataset is missing required columns: {missing}")

    df = df[GLOBE_COLUMNS].copy()
    df["iso_code"] = df["iso_code"].astype("string").str.strip().str.upper()
    df["country"] = df["country"].astype("string").str.strip()
    df["region"] = df["region"].astype("string").str.strip()
    df["income_group"] = df["income_group"].astype("string").str.strip()

    for column in NUMERIC_COLUMNS:
        df[column] = pd.to_numeric(df[column], errors="coerce")
        df[column] = df[column].replace([float("inf"), float("-inf")], pd.NA)

    df = df[df["iso_code"].str.match(ISO3_RE, na=False)].copy()
    df = df[df["year"].between(START_YEAR, END_YEAR)].copy()
    df = df[~df["country"].isin(PROHIBITED_AGGREGATES)].copy()
    df = df.drop_duplicates(["iso_code", "year"], keep="first")
    df["year"] = df["year"].astype(int)

    yearly_medians = df.groupby("year")["co2_per_capita"].median()
    df["development_carbon_profile"] = df.apply(lambda row: profile_for_row(row, yearly_medians), axis=1)
    df = df.sort_values(["year", "country", "iso_code"]).reset_index(drop=True)

    records = []
    for _, row in df.iterrows():
        record = {}
        for column in GLOBE_COLUMNS + ["development_carbon_profile"]:
            value = clean_number(row[column])
            record[column] = value
        records.append(record)
    return records


def decode_arcs(arcs: list[list[list[int]]], transform: dict[str, list[float]]) -> list[list[list[float]]]:
    scale_x, scale_y = transform["scale"]
    translate_x, translate_y = transform["translate"]
    decoded = []
    for arc in arcs:
        x = 0
        y = 0
        points = []
        for dx, dy in arc:
            x += dx
            y += dy
            points.append([x * scale_x + translate_x, y * scale_y + translate_y])
        decoded.append(points)
    return decoded


def get_arc(decoded_arcs: list[list[list[float]]], arc_index: int) -> list[list[float]]:
    if arc_index >= 0:
        return decoded_arcs[arc_index]
    return list(reversed(decoded_arcs[~arc_index]))


def stitch_ring(decoded_arcs: list[list[list[float]]], arc_indexes: list[int]) -> list[list[float]]:
    ring: list[list[float]] = []
    for arc_index in arc_indexes:
        arc = get_arc(decoded_arcs, arc_index)
        if not arc:
            continue
        if ring and ring[-1] == arc[0]:
            ring.extend(arc[1:])
        else:
            ring.extend(arc)
    if ring and ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


def topology_geometry_to_geojson(geometry: dict[str, Any], decoded_arcs: list[list[list[float]]]) -> dict[str, Any] | None:
    geometry_type = geometry.get("type")
    arcs = geometry.get("arcs")
    if not arcs:
        return None

    if geometry_type == "Polygon":
        coordinates = [stitch_ring(decoded_arcs, ring) for ring in arcs]
        coordinates = [ring for ring in coordinates if len(ring) >= 4]
        if not coordinates:
            return None
        return {"type": "Polygon", "coordinates": coordinates}

    if geometry_type == "MultiPolygon":
        polygons = []
        for polygon in arcs:
            rings = [stitch_ring(decoded_arcs, ring) for ring in polygon]
            rings = [ring for ring in rings if len(ring) >= 4]
            if rings:
                polygons.append(rings)
        if not polygons:
            return None
        return {"type": "MultiPolygon", "coordinates": polygons}

    return None


def prepare_world_geojson() -> dict[str, Any]:
    response = requests.get(WORLD_ATLAS_URL, timeout=60)
    response.raise_for_status()
    topology = response.json()

    if topology.get("type") != "Topology":
        raise ValueError("Expected a TopoJSON topology from visionscarto-world-atlas")

    decoded_arcs = decode_arcs(topology["arcs"], topology["transform"])
    geometries = topology["objects"]["countries"]["geometries"]
    features = []
    for geometry in geometries:
        properties = geometry.get("properties") or {}
        iso_code = str(properties.get("a3") or properties.get("iso_a3") or "").strip().upper()
        name = str(properties.get("name") or "").strip()
        if not ISO3_RE.match(iso_code):
            continue
        geojson_geometry = topology_geometry_to_geojson(geometry, decoded_arcs)
        if geojson_geometry is None:
            continue
        features.append(
            {
                "type": "Feature",
                "id": iso_code,
                "properties": {
                    "iso_code": iso_code,
                    "name": name,
                },
                "geometry": geojson_geometry,
            }
        )

    return {
        "type": "FeatureCollection",
        "name": "world_countries_110m_iso3",
        "features": features,
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    globe_records = prepare_globe_data()
    with GLOBE_JSON_PATH.open("w", encoding="utf-8") as handle:
        json.dump(globe_records, handle, ensure_ascii=False, allow_nan=False, separators=(",", ":"))

    world_geojson = prepare_world_geojson()
    with WORLD_GEOJSON_PATH.open("w", encoding="utf-8") as handle:
        json.dump(world_geojson, handle, ensure_ascii=False, allow_nan=False, separators=(",", ":"))

    print(f"Saved {GLOBE_JSON_PATH} rows={len(globe_records)}")
    print(f"Saved {WORLD_GEOJSON_PATH} features={len(world_geojson['features'])}")


if __name__ == "__main__":
    main()
