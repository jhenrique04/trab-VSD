from __future__ import annotations

import re

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


MEASURE_SPECS = {
    "hdi": "hdi",
    "le": "life_expectancy_undp",
    "eys": "expected_years_schooling",
    "mys": "mean_years_schooling",
    "gnipc": "gni_per_capita_undp",
    "pop_total": "population_undp",
}

UNDP_REGION_MAP = {
    "AS": "Arab States",
    "EAP": "East Asia and the Pacific",
    "ECA": "Europe and Central Asia",
    "LAC": "Latin America and the Caribbean",
    "SA": "South Asia",
    "SSA": "Sub-Saharan Africa",
}


def melt_measure(df: pd.DataFrame, prefix: str, output_name: str) -> pd.DataFrame:
    pattern = re.compile(rf"^{re.escape(prefix)}_(\d{{4}})$")
    value_cols = [col for col in df.columns if pattern.match(col)]
    base_cols = [
        "iso_code",
        "country",
        "hdi_development_group",
        "undp_region_code",
        "undp_region",
        "hdi_rank",
    ]
    long_df = df[base_cols + value_cols].melt(
        id_vars=base_cols,
        var_name="measure_year",
        value_name=output_name,
    )
    long_df["year"] = long_df["measure_year"].str.extract(r"(\d{4})").astype(int)
    long_df = long_df.drop(columns=["measure_year"])
    long_df[output_name] = to_numeric(long_df[output_name])
    return long_df


def main() -> None:
    logger = setup_logging("04_clean_undp")
    raw_path = RAW_DIR / "undp" / "HDR25_Composite_indices_complete_time_series.csv"
    df = read_csv(raw_path)

    df = df.rename(
        columns={
            "iso3": "iso_code",
            "hdicode": "hdi_development_group",
            "region": "undp_region_code",
            "hdi_rank_2023": "hdi_rank",
        }
    )
    df["iso_code"] = clean_iso(df["iso_code"])
    df["country"] = df["country"].astype("string").str.strip()
    df["undp_region_code"] = df["undp_region_code"].astype("string").str.strip()
    df["undp_region"] = df["undp_region_code"].map(UNDP_REGION_MAP)
    df["hdi_rank"] = to_numeric(df["hdi_rank"])

    before = len(df)
    df = df[valid_iso_filter(df)].copy()
    logger.info("Filtered UNDP invalid ISO rows: %s -> %s", before, len(df))

    long_frames = [melt_measure(df, prefix, output_name) for prefix, output_name in MEASURE_SPECS.items()]
    clean = long_frames[0]
    for frame in long_frames[1:]:
        clean = clean.merge(
            frame,
            on=[
                "iso_code",
                "country",
                "hdi_development_group",
                "undp_region_code",
                "undp_region",
                "hdi_rank",
                "year",
            ],
            how="outer",
        )

    clean = clean[(clean["year"] >= START_YEAR) & (clean["year"] <= END_YEAR)].copy()
    clean = clean.sort_values(["iso_code", "year"]).reset_index(drop=True)
    clean = drop_duplicate_country_year(clean, logger, "UNDP clean")

    output = INTERIM_DIR / "undp_hdi_clean.csv"
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
