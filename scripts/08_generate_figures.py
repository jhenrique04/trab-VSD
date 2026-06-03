from __future__ import annotations

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

from pipeline_utils import FIGURES_DIR, PROCESSED_DIR, read_csv, setup_logging


SELECTED_COUNTRIES = ["Brazil", "United States", "China", "India", "Germany"]
KEY_INDICATORS = [
    "hdi",
    "life_expectancy",
    "mean_years_schooling",
    "gdp_per_capita_ppp_constant",
    "population",
    "co2_per_capita",
    "co2_total_mt",
    "total_ghg",
]


def latest_year_with_data(df: pd.DataFrame, required_cols: list[str], min_countries: int = 50) -> int:
    counts = (
        df.dropna(subset=required_cols)
        .groupby("year")["iso_code"]
        .nunique()
        .sort_index(ascending=False)
    )
    enough = counts[counts >= min_countries]
    if not enough.empty:
        return int(enough.index[0])
    if not counts.empty:
        return int(counts.index[0])
    raise RuntimeError(f"No usable data for columns {required_cols}")


def scaled_sizes(series: pd.Series) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce")
    values = values.clip(lower=0)
    if values.notna().sum() == 0:
        return pd.Series(90, index=series.index)
    sqrt_values = np.sqrt(values.fillna(values.median()))
    minimum = sqrt_values.min()
    maximum = sqrt_values.max()
    if maximum == minimum:
        return pd.Series(90, index=series.index)
    return 30 + (sqrt_values - minimum) / (maximum - minimum) * 520


def save_scatter(df: pd.DataFrame, logger) -> None:
    year = latest_year_with_data(df, ["hdi", "co2_per_capita"], 80)
    data = df[df["year"].eq(year)].dropna(subset=["hdi", "co2_per_capita"]).copy()
    data["region_plot"] = data["region"].fillna("Unclassified")
    data["size_plot"] = scaled_sizes(data["population"].combine_first(data["gdp_per_capita_ppp_constant"]))

    plt.figure(figsize=(12, 8))
    sns.scatterplot(
        data=data,
        x="hdi",
        y="co2_per_capita",
        hue="region_plot",
        size="size_plot",
        sizes=(25, 550),
        alpha=0.72,
        edgecolor="white",
        linewidth=0.4,
        legend="brief",
    )
    plt.title(f"HDI vs CO2 per capita, {year}")
    plt.xlabel("HDI")
    plt.ylabel("CO2 per capita (tonnes per person)")
    plt.grid(True, alpha=0.22)
    plt.legend(title="Region / size", bbox_to_anchor=(1.02, 1), loc="upper left", borderaxespad=0)
    plt.tight_layout()
    output = FIGURES_DIR / "01_scatter_hdi_vs_co2_per_capita_latest.png"
    plt.savefig(output, dpi=180)
    plt.close()
    logger.info("Saved %s", output)


def save_lines(df: pd.DataFrame, logger) -> None:
    data = df[df["country"].isin(SELECTED_COUNTRIES)].copy()
    fig, axes = plt.subplots(2, 1, figsize=(12, 9), sharex=True)
    sns.lineplot(data=data, x="year", y="hdi", hue="country", marker="o", markersize=3, ax=axes[0])
    axes[0].set_title("HDI over time")
    axes[0].set_ylabel("HDI")
    axes[0].set_xlabel("")
    axes[0].grid(True, alpha=0.22)
    axes[0].legend(title="Country", ncols=3, fontsize=8)

    sns.lineplot(data=data, x="year", y="co2_per_capita", hue="country", marker="o", markersize=3, ax=axes[1])
    axes[1].set_title("CO2 per capita over time")
    axes[1].set_ylabel("CO2 per capita (tonnes per person)")
    axes[1].set_xlabel("Year")
    axes[1].grid(True, alpha=0.22)
    axes[1].legend(title="Country", ncols=3, fontsize=8)

    plt.tight_layout()
    output = FIGURES_DIR / "02_line_hdi_co2_selected_countries.png"
    plt.savefig(output, dpi=180)
    plt.close()
    logger.info("Saved %s", output)


def save_top_co2(df: pd.DataFrame, logger) -> None:
    year = latest_year_with_data(df, ["co2_per_capita"], 80)
    data = (
        df[df["year"].eq(year)]
        .dropna(subset=["country", "co2_per_capita"])
        .sort_values("co2_per_capita", ascending=False)
        .head(20)
        .sort_values("co2_per_capita")
    )
    plt.figure(figsize=(10, 8))
    sns.barplot(data=data, x="co2_per_capita", y="country", hue="income_group", dodge=False)
    plt.title(f"Top 20 countries by CO2 per capita, {year}")
    plt.xlabel("CO2 per capita (tonnes per person)")
    plt.ylabel("")
    plt.legend(title="Income group", bbox_to_anchor=(1.02, 1), loc="upper left")
    plt.tight_layout()
    output = FIGURES_DIR / "03_bar_top_co2_per_capita_latest.png"
    plt.savefig(output, dpi=180)
    plt.close()
    logger.info("Saved %s", output)


def save_top_hdi(df: pd.DataFrame, logger) -> None:
    year = latest_year_with_data(df, ["hdi"], 80)
    data = (
        df[df["year"].eq(year)]
        .dropna(subset=["country", "hdi"])
        .sort_values("hdi", ascending=False)
        .head(20)
        .sort_values("hdi")
    )
    plt.figure(figsize=(10, 8))
    sns.barplot(data=data, x="hdi", y="country", hue="region", dodge=False)
    plt.title(f"Top 20 countries by HDI, {year}")
    plt.xlabel("HDI")
    plt.ylabel("")
    plt.xlim(max(0, data["hdi"].min() - 0.03), 1.0)
    plt.legend(title="Region", bbox_to_anchor=(1.02, 1), loc="upper left")
    plt.tight_layout()
    output = FIGURES_DIR / "04_bar_top_hdi_latest.png"
    plt.savefig(output, dpi=180)
    plt.close()
    logger.info("Saved %s", output)


def save_missingness(df: pd.DataFrame, logger) -> None:
    rows = []
    for year, group in df.groupby("year"):
        for indicator in KEY_INDICATORS:
            rows.append(
                {
                    "year": int(year),
                    "indicator": indicator,
                    "missing_percent": group[indicator].isna().mean() * 100,
                }
            )
    missing = pd.DataFrame(rows)
    matrix = missing.pivot(index="indicator", columns="year", values="missing_percent")

    plt.figure(figsize=(14, 5.8))
    sns.heatmap(matrix, cmap="viridis", vmin=0, vmax=100, cbar_kws={"label": "Missing values (%)"})
    plt.title("Missingness by indicator and year")
    plt.xlabel("Year")
    plt.ylabel("")
    plt.tight_layout()
    output = FIGURES_DIR / "05_missingness_heatmap.png"
    plt.savefig(output, dpi=180)
    plt.close()
    logger.info("Saved %s", output)


def main() -> None:
    logger = setup_logging("08_generate_figures")
    sns.set_theme(style="whitegrid", context="notebook")
    df = read_csv(PROCESSED_DIR / "dev_planet_country_year_wide.csv")
    for col in KEY_INDICATORS + ["hdi", "population", "gdp_per_capita_ppp_constant", "co2_per_capita"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    save_scatter(df, logger)
    save_lines(df, logger)
    save_top_co2(df, logger)
    save_top_hdi(df, logger)
    save_missingness(df, logger)


if __name__ == "__main__":
    main()
