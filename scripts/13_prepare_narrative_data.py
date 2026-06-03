"""Prepara o JSON da narrativa scrollytelling (Desenvolvimento e Planeta).

A partir da base país-ano já consolidada, calcula campos derivados que sustentam
os atos da narrativa, sem nenhuma fonte nova:

- net_imported_co2  = consumption_co2 - co2_total_mt  (carbono "terceirizado":
  positivo = país importa emissões; negativo = exporta). Ato 3 "O mapa que mente".
- share_global_co2  = co2_total_mt / total mundial do ano (responsabilidade atual).
- earths            = co2_per_capita / limite sustentável per capita. Ato 2
  "Quantas Terras?": se todos vivessem assim, quantos planetas seriam precisos.

Gera tambem um resumo global por ano (world_by_year) para escalas e contexto.

Uso:
    python scripts/13_prepare_narrative_data.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import pandas as pd

from pipeline_utils import now_iso, setup_logging

PROJECT_DIR = Path(__file__).resolve().parents[1]
SOURCE_PATH = PROJECT_DIR / "data" / "processed" / "dev_planet_country_year_wide.csv"
OUTPUT_PATH = PROJECT_DIR / "web" / "threejs-globe" / "data" / "dev_planet_narrative.json"

# Limite sustentável de CO2 per capita (t/ano). Referência alinhada a uma divisão
# igualitária do orçamento de carbono compatível com Paris (~1.5–2.0 °C). É um
# parâmetro transparente da narrativa, não uma medição.
SUSTAINABLE_CO2_PER_CAPITA = 2.3

NARRATIVE_COLUMNS = [
    "iso_code",
    "country",
    "year",
    "region",
    "income_group",
    "hdi",
    "co2_per_capita",
    "consumption_co2_per_capita",
    "co2_total_mt",
    "consumption_co2",
    "cumulative_co2",
    "gdp_per_capita_ppp_constant",
    "life_expectancy",
    "mean_years_schooling",
    "population",
    "development_carbon_profile",
]


def clean_number(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if pd.isna(value):
        return None
    if isinstance(value, float):
        return float(value)
    if isinstance(value, (int,)):
        return int(value)
    return value


def main() -> None:
    logger = setup_logging("13_prepare_narrative_data")
    df = pd.read_csv(SOURCE_PATH, encoding="utf-8", low_memory=False)

    missing = [c for c in NARRATIVE_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Fonte sem colunas necessárias: {missing}")

    df = df[NARRATIVE_COLUMNS].copy()

    # CO2 líquido importado (carbono "terceirizado").
    df["net_imported_co2"] = df["consumption_co2"] - df["co2_total_mt"]

    # Participação global no CO2 territorial do ano.
    yearly_total = df.groupby("year")["co2_total_mt"].transform("sum")
    df["share_global_co2"] = df["co2_total_mt"] / yearly_total

    # Quantas Terras: razão entre o per capita do país e o limite sustentável.
    df["earths"] = df["co2_per_capita"] / SUSTAINABLE_CO2_PER_CAPITA

    records: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        records.append({key: clean_number(row[key]) for key in df.columns})

    # Resumo global por ano (para escalas e narrativa).
    world_by_year = []
    for year, group in df.groupby("year"):
        pop = group["population"].sum(min_count=1)
        co2 = group["co2_total_mt"].sum(min_count=1)
        world_by_year.append(
            {
                "year": int(year),
                "co2_total_mt": clean_number(co2),
                "population": clean_number(pop),
                "co2_per_capita_world": clean_number(co2 * 1e6 / pop) if pop else None,
                "countries": int(group["iso_code"].nunique()),
            }
        )

    payload = {
        "generated_at": now_iso(),
        "sustainable_co2_per_capita": SUSTAINABLE_CO2_PER_CAPITA,
        "world_by_year": world_by_year,
        "rows": records,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    logger.info("Salvo %s rows=%s anos=%s", OUTPUT_PATH, len(records), len(world_by_year))


if __name__ == "__main__":
    main()
