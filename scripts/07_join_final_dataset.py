from __future__ import annotations

import numpy as np
import pandas as pd

from pipeline_utils import (
    END_YEAR,
    INTERIM_DIR,
    PROCESSED_DIR,
    TABLEAU_DIR,
    clean_iso,
    drop_duplicate_country_year,
    read_csv,
    save_csv,
    setup_logging,
    to_numeric,
    valid_iso_filter,
)


INDICATOR_META = {
    "hdi": {
        "name": "Human Development Index",
        "unit": "index (0-1)",
        "source": "UNDP HDR",
        "original_column": "hdi_YYYY",
    },
    "hdi_rank": {
        "name": "HDI rank",
        "unit": "rank",
        "source": "UNDP HDR",
        "original_column": "hdi_rank_2023",
    },
    "life_expectancy": {
        "name": "Life expectancy at birth",
        "unit": "years",
        "source": "UNDP HDR; World Bank fallback",
        "original_column": "le_YYYY; SP.DYN.LE00.IN",
    },
    "expected_years_schooling": {
        "name": "Expected years of schooling",
        "unit": "years",
        "source": "UNDP HDR",
        "original_column": "eys_YYYY",
    },
    "mean_years_schooling": {
        "name": "Mean years of schooling",
        "unit": "years",
        "source": "UNDP HDR",
        "original_column": "mys_YYYY",
    },
    "gni_per_capita": {
        "name": "Gross national income per capita",
        "unit": "2017 PPP $",
        "source": "UNDP HDR",
        "original_column": "gnipc_YYYY",
    },
    "gdp_per_capita_ppp_constant": {
        "name": "GDP per capita, PPP",
        "unit": "constant 2021 international $",
        "source": "World Bank WDI",
        "original_column": "NY.GDP.PCAP.PP.KD",
    },
    "population": {
        "name": "Population",
        "unit": "persons",
        "source": "World Bank WDI; OWID fallback; UNDP fallback",
        "original_column": "SP.POP.TOTL; population; pop_total_YYYY",
    },
    "co2_total_mt": {
        "name": "CO2 emissions",
        "unit": "million tonnes",
        "source": "Our World in Data",
        "original_column": "co2",
    },
    "co2_per_capita": {
        "name": "CO2 emissions per capita",
        "unit": "tonnes per person",
        "source": "Our World in Data",
        "original_column": "co2_per_capita",
    },
    "cumulative_co2": {
        "name": "Cumulative CO2 emissions",
        "unit": "million tonnes",
        "source": "Our World in Data",
        "original_column": "cumulative_co2",
    },
    "consumption_co2": {
        "name": "Consumption-based CO2 emissions",
        "unit": "million tonnes",
        "source": "Our World in Data",
        "original_column": "consumption_co2",
    },
    "consumption_co2_per_capita": {
        "name": "Consumption-based CO2 per capita",
        "unit": "tonnes per person",
        "source": "Our World in Data",
        "original_column": "consumption_co2_per_capita",
    },
    "total_ghg": {
        "name": "Total greenhouse gas emissions",
        "unit": "million tonnes CO2-equivalent",
        "source": "Our World in Data",
        "original_column": "total_ghg",
    },
    "ghg_per_capita": {
        "name": "Greenhouse gas emissions per capita",
        "unit": "tonnes CO2-equivalent per person",
        "source": "Our World in Data",
        "original_column": "ghg_per_capita",
    },
    "hdi_to_co2_ratio": {
        "name": "HDI to CO2 per capita ratio",
        "unit": "index per tonne per person",
        "source": "Calculated",
        "original_column": "hdi / co2_per_capita",
    },
    "co2_per_capita_change_1990_latest": {
        "name": "CO2 per capita change from 1990 to latest",
        "unit": "tonnes per person",
        "source": "Calculated",
        "original_column": "co2_per_capita",
    },
    "hdi_change_1990_latest": {
        "name": "HDI change from 1990 to latest",
        "unit": "index points",
        "source": "Calculated",
        "original_column": "hdi",
    },
    "gdp_per_capita_change_1990_latest": {
        "name": "GDP per capita PPP change from 1990 to latest",
        "unit": "constant 2021 international $",
        "source": "Calculated",
        "original_column": "gdp_per_capita_ppp_constant",
    },
}


FINAL_COLUMNS = [
    "iso_code",
    "country",
    "year",
    "region",
    "income_group",
    "hdi_development_group",
    "hdi_category",
    "co2_per_capita_category",
    "development_carbon_profile",
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
    "life_expectancy_undp",
    "life_expectancy_wb",
    "gni_per_capita_undp",
    "population_wb",
    "population_owid",
    "population_undp",
    "gdp_owid",
    "region_code",
    "income_group_code",
    "undp_region",
]


def hdi_category(value: float) -> str | float:
    if pd.isna(value):
        return np.nan
    if value >= 0.800:
        return "Muito alto"
    if value >= 0.700:
        return "Alto"
    if value >= 0.550:
        return "Medio"
    return "Baixo"


def co2_category(value: float) -> str | float:
    if pd.isna(value):
        return np.nan
    if value >= 15:
        return "Muito alto"
    if value >= 8:
        return "Alto"
    if value >= 3:
        return "Medio"
    return "Baixo"


def add_change_column(df: pd.DataFrame, value_col: str, output_col: str) -> pd.Series:
    def country_change(group: pd.DataFrame) -> float:
        base_values = group.loc[group["year"].eq(1990), value_col].dropna()
        if base_values.empty:
            return np.nan
        valid = group.loc[group[value_col].notna(), ["year", value_col]].sort_values("year")
        if valid.empty:
            return np.nan
        return float(valid.iloc[-1][value_col] - base_values.iloc[0])

    changes = df.groupby("iso_code", dropna=False).apply(country_change, include_groups=False)
    return df["iso_code"].map(changes).rename(output_col)


def build_long_table(wide: pd.DataFrame) -> pd.DataFrame:
    id_cols = ["iso_code", "country", "year", "region", "income_group"]
    indicator_cols = [col for col in INDICATOR_META if col in wide.columns]
    long_df = wide[id_cols + indicator_cols].melt(
        id_vars=id_cols,
        value_vars=indicator_cols,
        var_name="indicator_code",
        value_name="indicator_value",
    )
    long_df["indicator_value"] = to_numeric(long_df["indicator_value"])
    long_df = long_df[long_df["indicator_value"].notna()].copy()
    long_df["indicator_name"] = long_df["indicator_code"].map(lambda x: INDICATOR_META[x]["name"])
    long_df["indicator_unit"] = long_df["indicator_code"].map(lambda x: INDICATOR_META[x]["unit"])
    long_df["source"] = long_df["indicator_code"].map(lambda x: INDICATOR_META[x]["source"])
    return long_df[
        [
            "iso_code",
            "country",
            "year",
            "region",
            "income_group",
            "indicator_code",
            "indicator_name",
            "indicator_value",
            "indicator_unit",
            "source",
        ]
    ].sort_values(["iso_code", "year", "indicator_code"])


def build_latest_table(wide: pd.DataFrame) -> pd.DataFrame:
    principal = [
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

    rows = []
    for iso_code, group in wide.sort_values("year").groupby("iso_code"):
        identity = group.dropna(subset=["country"]).tail(1)
        if identity.empty:
            identity = group.tail(1)
        row = {
            "iso_code": iso_code,
            "country": identity["country"].iloc[0],
            "region": identity["region"].iloc[0],
            "income_group": identity["income_group"].iloc[0],
        }
        for col in principal:
            valid = group.loc[group[col].notna(), ["year", col]].sort_values("year") if col in group else pd.DataFrame()
            if valid.empty:
                row[col] = np.nan
                row[f"{col}_year"] = np.nan
            else:
                row[col] = valid.iloc[-1][col]
                row[f"{col}_year"] = int(valid.iloc[-1]["year"])
        row["hdi_category"] = hdi_category(row["hdi"])
        row["co2_per_capita_category"] = co2_category(row["co2_per_capita"])
        rows.append(row)
    return pd.DataFrame(rows).sort_values(["country", "iso_code"])


def build_data_dictionary() -> pd.DataFrame:
    rows = [
        {
            "column_name": "iso_code",
            "label_pt": "Codigo ISO3",
            "label_en": "ISO3 code",
            "description": "Codigo de pais/territorio com tres letras usado como chave de integracao.",
            "unit": "",
            "source": "All sources",
            "original_column": "iso3; countryiso3code; iso_code",
            "treatment_notes": "Padronizado em maiusculas; agregados removidos da base principal.",
        },
        {
            "column_name": "country",
            "label_pt": "Pais",
            "label_en": "Country",
            "description": "Nome do pais em ingles.",
            "unit": "",
            "source": "UNDP preferred; World Bank; OWID",
            "original_column": "country; country.value",
            "treatment_notes": "Prioridade de nomes: UNDP, depois World Bank, depois OWID.",
        },
        {
            "column_name": "year",
            "label_pt": "Ano",
            "label_en": "Year",
            "description": "Ano calendario da observacao pais-ano.",
            "unit": "year",
            "source": "All sources",
            "original_column": "year; date; *_YYYY",
            "treatment_notes": "Convertido para inteiro; escopo 1990-2023.",
        },
        {
            "column_name": "region",
            "label_pt": "Regiao",
            "label_en": "Region",
            "description": "Classificacao regional do pais.",
            "unit": "",
            "source": "World Bank; UNDP fallback",
            "original_column": "region.value; region",
            "treatment_notes": "Agregados World Bank removidos antes da integracao.",
        },
        {
            "column_name": "income_group",
            "label_pt": "Grupo de renda",
            "label_en": "Income group",
            "description": "Classificacao de renda do World Bank.",
            "unit": "",
            "source": "World Bank",
            "original_column": "incomeLevel.value",
            "treatment_notes": "Sem preenchimento automatico quando ausente.",
        },
        {
            "column_name": "hdi_development_group",
            "label_pt": "Grupo de desenvolvimento humano",
            "label_en": "Human development group",
            "description": "Grupo de desenvolvimento humano publicado pelo UNDP.",
            "unit": "",
            "source": "UNDP HDR",
            "original_column": "hdicode",
            "treatment_notes": "Mantido como atributo auxiliar.",
        },
        {
            "column_name": "hdi_category",
            "label_pt": "Categoria IDH",
            "label_en": "HDI category",
            "description": "Categoria calculada a partir do IDH.",
            "unit": "",
            "source": "Calculated",
            "original_column": "hdi",
            "treatment_notes": "Muito alto >=0.800; Alto >=0.700; Medio >=0.550; Baixo <0.550.",
        },
        {
            "column_name": "co2_per_capita_category",
            "label_pt": "Categoria CO2 per capita",
            "label_en": "CO2 per capita category",
            "description": "Categoria calculada de emissoes de CO2 per capita.",
            "unit": "",
            "source": "Calculated",
            "original_column": "co2_per_capita",
            "treatment_notes": "Muito alto >=15; Alto >=8; Medio >=3; Baixo <3.",
        },
        {
            "column_name": "development_carbon_profile",
            "label_pt": "Perfil desenvolvimento-carbono",
            "label_en": "Development-carbon profile",
            "description": "Perfil exploratorio que combina alto desenvolvimento e emissao acima da mediana global do ano.",
            "unit": "",
            "source": "Calculated",
            "original_column": "hdi; co2_per_capita",
            "treatment_notes": "Alto desenvolvimento se hdi >=0.800; alta emissao se co2_per_capita >= mediana global do ano.",
        },
    ]

    labels_pt = {
        "hdi": "Indice de Desenvolvimento Humano",
        "hdi_rank": "Ranking IDH",
        "life_expectancy": "Expectativa de vida",
        "expected_years_schooling": "Anos esperados de escolaridade",
        "mean_years_schooling": "Anos medios de escolaridade",
        "gni_per_capita": "RNB per capita",
        "gdp_per_capita_ppp_constant": "PIB per capita PPC constante",
        "population": "Populacao",
        "co2_total_mt": "CO2 total",
        "co2_per_capita": "CO2 per capita",
        "cumulative_co2": "CO2 acumulado",
        "consumption_co2": "CO2 baseado em consumo",
        "consumption_co2_per_capita": "CO2 de consumo per capita",
        "total_ghg": "GEE total",
        "ghg_per_capita": "GEE per capita",
        "hdi_to_co2_ratio": "Razao IDH/CO2 per capita",
        "co2_per_capita_change_1990_latest": "Mudanca CO2 per capita 1990-ultimo",
        "hdi_change_1990_latest": "Mudanca IDH 1990-ultimo",
        "gdp_per_capita_change_1990_latest": "Mudanca PIB per capita 1990-ultimo",
    }

    for column, meta in INDICATOR_META.items():
        rows.append(
            {
                "column_name": column,
                "label_pt": labels_pt.get(column, meta["name"]),
                "label_en": meta["name"],
                "description": meta["name"],
                "unit": meta["unit"],
                "source": meta["source"],
                "original_column": meta["original_column"],
                "treatment_notes": "Sem interpolacao; valores ausentes permanecem vazios/NaN.",
            }
        )
    rows.extend(
        [
            {
                "column_name": "life_expectancy_undp",
                "label_pt": "Expectativa de vida UNDP",
                "label_en": "UNDP life expectancy",
                "description": "Expectativa de vida ao nascer publicada pelo UNDP.",
                "unit": "years",
                "source": "UNDP HDR",
                "original_column": "le_YYYY",
                "treatment_notes": "Mantida para auditoria da escolha de life_expectancy.",
            },
            {
                "column_name": "life_expectancy_wb",
                "label_pt": "Expectativa de vida World Bank",
                "label_en": "World Bank life expectancy",
                "description": "Expectativa de vida ao nascer publicada pelo World Bank.",
                "unit": "years",
                "source": "World Bank WDI",
                "original_column": "SP.DYN.LE00.IN",
                "treatment_notes": "Usada como fallback quando UNDP esta ausente.",
            },
            {
                "column_name": "population_wb",
                "label_pt": "Populacao World Bank",
                "label_en": "World Bank population",
                "description": "Populacao total publicada pelo World Bank.",
                "unit": "persons",
                "source": "World Bank WDI",
                "original_column": "SP.POP.TOTL",
                "treatment_notes": "Fonte preferencial para population.",
            },
            {
                "column_name": "population_owid",
                "label_pt": "Populacao OWID",
                "label_en": "OWID population",
                "description": "Populacao no arquivo de CO2 da OWID.",
                "unit": "persons",
                "source": "Our World in Data",
                "original_column": "population",
                "treatment_notes": "Usada como fallback para population.",
            },
            {
                "column_name": "population_undp",
                "label_pt": "Populacao UNDP",
                "label_en": "UNDP population",
                "description": "Populacao no arquivo do UNDP.",
                "unit": "persons",
                "source": "UNDP HDR",
                "original_column": "pop_total_YYYY",
                "treatment_notes": "Usada como fallback final para population.",
            },
            {
                "column_name": "gdp_owid",
                "label_pt": "PIB OWID",
                "label_en": "OWID GDP",
                "description": "PIB no arquivo de CO2 da OWID.",
                "unit": "international dollars",
                "source": "Our World in Data",
                "original_column": "gdp",
                "treatment_notes": "Mantido para validacao; nao substitui o indicador World Bank.",
            },
        ]
    )
    return pd.DataFrame(rows)


def build_quality_report(wide: pd.DataFrame) -> pd.DataFrame:
    rows = []
    source_cols = [col for col in INDICATOR_META if col in wide.columns]
    for col in source_cols:
        valid = wide[wide[col].notna()]
        rows.append(
            {
                "source": INDICATOR_META[col]["source"],
                "indicator": col,
                "min_year": int(valid["year"].min()) if not valid.empty else np.nan,
                "max_year": int(valid["year"].max()) if not valid.empty else np.nan,
                "countries_count": int(valid["iso_code"].nunique()) if not valid.empty else 0,
                "missing_values_count": int(wide[col].isna().sum()),
                "missing_values_percent": round(float(wide[col].isna().mean() * 100), 2),
                "notes": "Calculated on final country-year table; no imputation or interpolation.",
            }
        )
    return pd.DataFrame(rows).sort_values(["source", "indicator"])


def build_unmatched(undp: pd.DataFrame, wb: pd.DataFrame, owid: pd.DataFrame) -> pd.DataFrame:
    sets = {
        "undp": set(undp["iso_code"].dropna().unique()),
        "worldbank": set(wb["iso_code"].dropna().unique()),
        "owid": set(owid["iso_code"].dropna().unique()),
    }
    names = {
        "undp": undp.drop_duplicates("iso_code").set_index("iso_code")["country_undp"].to_dict(),
        "worldbank": wb.drop_duplicates("iso_code").set_index("iso_code")["country_wb"].to_dict(),
        "owid": owid.drop_duplicates("iso_code").set_index("iso_code")["country_owid"].to_dict(),
    }
    rows = []
    for iso_code in sorted(set.union(*sets.values())):
        present = {source: iso_code in values for source, values in sets.items()}
        if len({source for source, is_present in present.items() if is_present}) != len(sets):
            rows.append(
                {
                    "iso_code": iso_code,
                    "country_undp": names["undp"].get(iso_code),
                    "country_worldbank": names["worldbank"].get(iso_code),
                    "country_owid": names["owid"].get(iso_code),
                    "in_undp": present["undp"],
                    "in_worldbank": present["worldbank"],
                    "in_owid": present["owid"],
                    "notes": "Presence mismatch across source-level country sets; not necessarily a join error.",
                }
            )
    return pd.DataFrame(rows)


def build_key_country_check(wide: pd.DataFrame, latest: pd.DataFrame) -> pd.DataFrame:
    expected = [
        "Brazil",
        "United States",
        "China",
        "India",
        "Germany",
        "France",
        "United Kingdom",
        "Japan",
        "South Africa",
        "Nigeria",
    ]
    rows = []
    for country in expected:
        matches = latest[latest["country"].eq(country)]
        if matches.empty:
            country_rows = wide[wide["country"].eq(country)]
            matches = country_rows.drop_duplicates("iso_code").head(1)
        if matches.empty:
            rows.append({"country": country, "present": False})
        else:
            row = matches.iloc[0]
            rows.append(
                {
                    "country": country,
                    "present": True,
                    "iso_code": row.get("iso_code"),
                    "hdi_latest_year": row.get("hdi_year"),
                    "co2_per_capita_latest_year": row.get("co2_per_capita_year"),
                    "region": row.get("region"),
                    "income_group": row.get("income_group"),
                }
            )
    return pd.DataFrame(rows)


def main() -> None:
    logger = setup_logging("07_join_final_dataset")
    undp = read_csv(INTERIM_DIR / "undp_hdi_clean.csv").rename(columns={"country": "country_undp"})
    wb = read_csv(INTERIM_DIR / "worldbank_clean.csv").rename(columns={"country": "country_wb"})
    owid = read_csv(INTERIM_DIR / "owid_co2_clean.csv").rename(columns={"country": "country_owid"})

    for frame_name, frame in [("UNDP", undp), ("World Bank", wb), ("OWID", owid)]:
        frame["iso_code"] = clean_iso(frame["iso_code"])
        frame["year"] = pd.to_numeric(frame["year"], errors="coerce").astype(int)
        before = len(frame)
        frame.drop(frame.loc[~valid_iso_filter(frame)].index, inplace=True)
        logger.info("%s rows after ISO validation: %s -> %s", frame_name, before, len(frame))

    unmatched = build_unmatched(undp, wb, owid)
    save_csv(unmatched, INTERIM_DIR / "unmatched_iso_codes.csv")
    save_csv(unmatched, TABLEAU_DIR / "unmatched_iso_codes.csv")
    logger.info("Saved %s unmatched ISO presence rows", len(unmatched))

    merged = undp.merge(wb, on=["iso_code", "year"], how="outer")
    merged = merged.merge(owid, on=["iso_code", "year"], how="outer")
    merged = merged[(merged["year"] >= 1990) & (merged["year"] <= END_YEAR)].copy()

    merged["country"] = (
        merged["country_undp"].combine_first(merged["country_wb"]).combine_first(merged["country_owid"])
    )
    merged["region"] = merged["region"].combine_first(merged["undp_region"])
    merged["life_expectancy"] = merged["life_expectancy_undp"].combine_first(merged["life_expectancy_wb"])
    merged["gni_per_capita"] = merged["gni_per_capita_undp"]
    merged["population"] = (
        merged["population_wb"].combine_first(merged["population_owid"]).combine_first(merged["population_undp"])
    )

    numeric_cols = [
        "hdi",
        "hdi_rank",
        "life_expectancy",
        "life_expectancy_undp",
        "life_expectancy_wb",
        "expected_years_schooling",
        "mean_years_schooling",
        "gni_per_capita",
        "gni_per_capita_undp",
        "gdp_per_capita_ppp_constant",
        "population",
        "population_wb",
        "population_owid",
        "population_undp",
        "co2_total_mt",
        "co2_per_capita",
        "cumulative_co2",
        "consumption_co2",
        "consumption_co2_per_capita",
        "total_ghg",
        "ghg_per_capita",
        "gdp_owid",
    ]
    for col in numeric_cols:
        if col not in merged.columns:
            merged[col] = np.nan
        merged[col] = to_numeric(merged[col])

    merged["hdi_category"] = merged["hdi"].map(hdi_category)
    merged["co2_per_capita_category"] = merged["co2_per_capita"].map(co2_category)
    yearly_co2_median = merged.groupby("year")["co2_per_capita"].median()
    merged["co2_per_capita_global_median"] = merged["year"].map(yearly_co2_median)
    high_development = merged["hdi"].ge(0.800).fillna(False)
    high_emission = merged["co2_per_capita"].ge(merged["co2_per_capita_global_median"]).fillna(False)
    merged["development_carbon_profile"] = np.select(
        [
            high_development & ~high_emission,
            high_development & high_emission,
            ~high_development & ~high_emission,
            ~high_development & high_emission,
        ],
        [
            "Alto desenvolvimento / baixa emissao",
            "Alto desenvolvimento / alta emissao",
            "Baixo desenvolvimento / baixa emissao",
            "Baixo desenvolvimento / alta emissao",
        ],
        default=None,
    )
    missing_profile = merged["hdi"].isna() | merged["co2_per_capita"].isna()
    merged.loc[missing_profile, "development_carbon_profile"] = np.nan

    positive_co2 = merged["co2_per_capita"].gt(0).fillna(False)
    merged["hdi_to_co2_ratio"] = np.where(positive_co2, merged["hdi"] / merged["co2_per_capita"], np.nan)
    merged["co2_per_capita_change_1990_latest"] = add_change_column(
        merged, "co2_per_capita", "co2_per_capita_change_1990_latest"
    )
    merged["hdi_change_1990_latest"] = add_change_column(merged, "hdi", "hdi_change_1990_latest")
    merged["gdp_per_capita_change_1990_latest"] = add_change_column(
        merged, "gdp_per_capita_ppp_constant", "gdp_per_capita_change_1990_latest"
    )

    for col in FINAL_COLUMNS:
        if col not in merged.columns:
            merged[col] = np.nan
    wide = merged[FINAL_COLUMNS].copy()
    wide["year"] = wide["year"].astype(int)
    wide = wide[valid_iso_filter(wide)].copy()
    wide = wide.sort_values(["iso_code", "year"]).reset_index(drop=True)
    wide = drop_duplicate_country_year(wide, logger, "Final wide")

    long_df = build_long_table(wide)
    latest = build_latest_table(wide)
    data_dictionary = build_data_dictionary()
    quality = build_quality_report(wide)
    key_country_check = build_key_country_check(wide, latest)

    save_csv(wide, PROCESSED_DIR / "dev_planet_country_year_wide.csv")
    save_csv(long_df, PROCESSED_DIR / "dev_planet_country_year_long.csv")
    save_csv(wide, TABLEAU_DIR / "dev_planet_tableau_wide.csv")
    save_csv(long_df, TABLEAU_DIR / "dev_planet_tableau_long.csv")
    save_csv(latest, TABLEAU_DIR / "dev_planet_country_latest.csv")
    save_csv(data_dictionary, TABLEAU_DIR / "dev_planet_data_dictionary.csv")
    save_csv(quality, TABLEAU_DIR / "dev_planet_quality_report.csv")
    save_csv(key_country_check, TABLEAU_DIR / "dev_planet_key_country_check.csv")

    logger.info(
        "Final wide: %s rows, %s countries, years %s-%s",
        len(wide),
        wide["iso_code"].nunique(),
        wide["year"].min(),
        wide["year"].max(),
    )
    logger.info("Final long: %s rows", len(long_df))
    logger.info("Latest country table: %s rows", len(latest))
    missing_key = key_country_check.loc[~key_country_check["present"].fillna(False), "country"].tolist()
    if missing_key:
        logger.warning("Missing expected key countries: %s", missing_key)
    else:
        logger.info("All expected key countries are present")


if __name__ == "__main__":
    main()
