from __future__ import annotations

import pandas as pd

from pipeline_utils import (
    INTERIM_DIR,
    RAW_DIR,
    clean_iso,
    drop_duplicate_country_year,
    read_csv,
    save_csv,
    setup_logging,
    to_numeric,
    valid_iso_filter,
)


INDICATOR_COLUMNS = {
    "NY.GDP.PCAP.PP.KD": "gdp_per_capita_ppp_constant",
    "SP.POP.TOTL": "population_wb",
    "SP.DYN.LE00.IN": "life_expectancy_wb",
}


def main() -> None:
    logger = setup_logging("05_clean_worldbank")
    long_df = read_csv(RAW_DIR / "worldbank" / "worldbank_indicators_long.csv")
    countries = read_csv(RAW_DIR / "worldbank" / "worldbank_countries.csv")

    long_df["iso_code"] = clean_iso(long_df["iso_code"])
    long_df["year"] = pd.to_numeric(long_df["year"], errors="coerce").astype("Int64")
    long_df["value"] = to_numeric(long_df["value"])
    long_df = long_df[valid_iso_filter(long_df)].copy()

    countries["iso_code"] = clean_iso(countries["iso_code"])
    countries["region"] = countries["region"].astype("string").str.strip()
    countries["income_group"] = countries["income_group"].astype("string").str.strip()
    countries = countries[valid_iso_filter(countries)].copy()
    countries = countries[countries["region"].ne("Aggregates")].copy()
    countries = countries.drop_duplicates("iso_code", keep="first")

    long_df = long_df.merge(
        countries[["iso_code", "country", "region", "income_group", "region_code", "income_group_code"]],
        on="iso_code",
        how="inner",
        suffixes=("_indicator", ""),
    )
    long_df["country"] = long_df["country"].fillna(long_df["country_indicator"])
    long_df = long_df.drop(columns=["country_indicator"])

    pivot = long_df.pivot_table(
        index=["iso_code", "country", "region", "income_group", "region_code", "income_group_code", "year"],
        columns="indicator_code",
        values="value",
        aggfunc="first",
    ).reset_index()
    pivot = pivot.rename(columns=INDICATOR_COLUMNS)
    pivot.columns.name = None

    for col in INDICATOR_COLUMNS.values():
        if col not in pivot.columns:
            pivot[col] = pd.NA
        pivot[col] = to_numeric(pivot[col])

    pivot["year"] = pivot["year"].astype(int)
    pivot = pivot.sort_values(["iso_code", "year"]).reset_index(drop=True)
    pivot = drop_duplicate_country_year(pivot, logger, "World Bank clean")

    output = INTERIM_DIR / "worldbank_clean.csv"
    save_csv(pivot, output)
    save_csv(countries, INTERIM_DIR / "worldbank_country_metadata_clean.csv")

    logger.info(
        "Saved %s rows, %s countries, years %s-%s to %s",
        len(pivot),
        pivot["iso_code"].nunique(),
        pivot["year"].min(),
        pivot["year"].max(),
        output,
    )


if __name__ == "__main__":
    main()
