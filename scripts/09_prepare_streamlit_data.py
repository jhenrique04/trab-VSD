from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parents[1]
INPUT_PATH = PROJECT_DIR / "data" / "processed" / "dev_planet_country_year_wide.csv"
OUTPUT_DIR = PROJECT_DIR / "data" / "streamlit"
OUTPUT_WIDE = OUTPUT_DIR / "dev_planet_streamlit_wide.csv"
OUTPUT_LATEST = OUTPUT_DIR / "dev_planet_streamlit_latest.csv"
OUTPUT_NULLS = OUTPUT_DIR / "dev_planet_streamlit_null_report.csv"

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

NUMERIC_COLUMNS = [
    "year",
    "hdi",
    "hdi_rank",
    "life_expectancy",
    "expected_years_schooling",
    "mean_years_schooling",
    "gni_per_capita",
    "gdp_per_capita_ppp_constant",
    "population",
    "co2_total_mt",
    "co2_per_capita",
    "cumulative_co2",
    "consumption_co2",
    "consumption_co2_per_capita",
    "total_ghg",
    "ghg_per_capita",
    "hdi_to_co2_ratio",
    "co2_per_capita_change_1990_latest",
    "hdi_change_1990_latest",
    "gdp_per_capita_change_1990_latest",
]

LATEST_REQUIRED_ANY = [
    "hdi",
    "co2_per_capita",
    "gdp_per_capita_ppp_constant",
    "life_expectancy",
    "mean_years_schooling",
    "population",
]


def build_null_report(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    total = len(df)
    for column in df.columns:
        missing_count = int(df[column].isna().sum())
        rows.append(
            {
                "column_name": column,
                "non_missing_count": int(total - missing_count),
                "missing_count": missing_count,
                "missing_percent": round((missing_count / total) * 100, 2) if total else 0,
            }
        )
    return pd.DataFrame(rows).sort_values(["missing_percent", "column_name"], ascending=[False, True])


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(INPUT_PATH, encoding="utf-8", low_memory=False)
    df["iso_code"] = df["iso_code"].astype("string").str.strip().str.upper()
    df["country"] = df["country"].astype("string").str.strip()
    df["year"] = pd.to_numeric(df["year"], errors="coerce")

    df = df[df["iso_code"].str.match(ISO3_RE, na=False)].copy()
    df = df[df["year"].between(START_YEAR, END_YEAR)].copy()
    df = df[~df["country"].isin(PROHIBITED_AGGREGATES)].copy()

    for column in NUMERIC_COLUMNS:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")
            df[column] = df[column].replace([np.inf, -np.inf], np.nan)

    df["year"] = df["year"].astype(int)
    df = df.drop_duplicates(["iso_code", "year"], keep="first")
    df = df.sort_values(["country", "year", "iso_code"]).reset_index(drop=True)

    null_report = build_null_report(df)

    latest_source = df.copy()
    latest_source["_has_any_key_indicator"] = latest_source[LATEST_REQUIRED_ANY].notna().any(axis=1)
    latest_source = latest_source[latest_source["_has_any_key_indicator"]].copy()
    latest = (
        latest_source.sort_values(["iso_code", "year"])
        .groupby("iso_code", as_index=False, dropna=False)
        .tail(1)
        .drop(columns=["_has_any_key_indicator"])
        .sort_values(["country", "iso_code"])
        .reset_index(drop=True)
    )

    df.to_csv(OUTPUT_WIDE, index=False, encoding="utf-8")
    latest.to_csv(OUTPUT_LATEST, index=False, encoding="utf-8")
    null_report.to_csv(OUTPUT_NULLS, index=False, encoding="utf-8")

    print(f"Saved {OUTPUT_WIDE} rows={len(df)} countries={df['iso_code'].nunique()} years={df['year'].min()}-{df['year'].max()}")
    print(f"Saved {OUTPUT_LATEST} rows={len(latest)}")
    print(f"Saved {OUTPUT_NULLS} rows={len(null_report)}")


if __name__ == "__main__":
    main()
