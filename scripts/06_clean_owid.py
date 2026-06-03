from __future__ import annotations

import pandas as pd

from pipeline_utils import (
    END_YEAR,
    INTERIM_DIR,
    RAW_DIR,
    START_YEAR,
    clean_iso,
    drop_duplicate_country_year,
    read_csv,
    save_csv,
    setup_logging,
    to_numeric,
    valid_iso_filter,
)


OWID_COLUMNS = {
    "co2": "co2_total_mt",
    "co2_per_capita": "co2_per_capita",
    "cumulative_co2": "cumulative_co2",
    "consumption_co2": "consumption_co2",
    "consumption_co2_per_capita": "consumption_co2_per_capita",
    "total_ghg": "total_ghg",
    "ghg_per_capita": "ghg_per_capita",
    "population": "population_owid",
    "gdp": "gdp_owid",
}


def main() -> None:
    logger = setup_logging("06_clean_owid")
    raw = read_csv(RAW_DIR / "owid" / "owid-co2-data.csv")

    raw["iso_code"] = clean_iso(raw["iso_code"])
    raw["year"] = pd.to_numeric(raw["year"], errors="coerce").astype("Int64")
    before = len(raw)
    raw = raw[raw["year"].between(START_YEAR, END_YEAR)].copy()
    raw = raw[valid_iso_filter(raw)].copy()
    logger.info("Filtered OWID rows: %s -> %s", before, len(raw))

    keep_cols = ["iso_code", "country", "year"] + list(OWID_COLUMNS.keys())
    for col in keep_cols:
        if col not in raw.columns:
            raw[col] = pd.NA
    clean = raw[keep_cols].rename(columns=OWID_COLUMNS).copy()
    clean["country"] = clean["country"].astype("string").str.strip()
    for col in OWID_COLUMNS.values():
        clean[col] = to_numeric(clean[col])
    clean["year"] = clean["year"].astype(int)

    clean = clean.sort_values(["iso_code", "year"]).reset_index(drop=True)
    clean = drop_duplicate_country_year(clean, logger, "OWID clean")

    output = INTERIM_DIR / "owid_co2_clean.csv"
    save_csv(clean, output)
    logger.info(
        "Saved %s rows, %s countries, years %s-%s to %s",
        len(clean),
        clean["iso_code"].nunique(),
        clean["year"].min(),
        clean["year"].max(),
        output,
    )


if __name__ == "__main__":
    main()
