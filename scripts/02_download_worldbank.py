from __future__ import annotations

import pandas as pd

from pipeline_utils import END_YEAR, RAW_DIR, START_YEAR, get_json, save_csv, setup_logging, write_manifest


BASE_URL = "https://api.worldbank.org/v2"

INDICATORS = {
    "NY.GDP.PCAP.PP.KD": "GDP per capita, PPP (constant 2021 international $)",
    "SP.POP.TOTL": "Population, total",
    "SP.DYN.LE00.IN": "Life expectancy at birth, total (years)",
}


def fetch_indicator(indicator_code: str, indicator_name: str, logger) -> pd.DataFrame:
    url = f"{BASE_URL}/country/all/indicator/{indicator_code}"
    rows = []
    page = 1
    pages = 1
    while page <= pages:
        payload = get_json(
            url,
            logger,
            params={
                "format": "json",
                "per_page": 1000,
                "page": page,
                "date": f"{START_YEAR}:{END_YEAR}",
            },
            retries=5,
        )
        if not isinstance(payload, list) or len(payload) != 2:
            raise RuntimeError(f"Unexpected World Bank payload for {indicator_code}")
        meta = payload[0] or {}
        rows.extend(payload[1] or [])
        pages = int(meta.get("pages", 1))
        logger.info("Fetched %s page %s/%s", indicator_code, page, pages)
        page += 1
    df = pd.json_normalize(rows)
    if df.empty:
        return pd.DataFrame(
            columns=[
                "iso_code",
                "country",
                "year",
                "indicator_code",
                "indicator_name",
                "value",
            ]
        )

    out = pd.DataFrame(
        {
            "iso_code": df.get("countryiso3code"),
            "country": df.get("country.value"),
            "year": df.get("date"),
            "indicator_code": indicator_code,
            "indicator_name": indicator_name,
            "value": df.get("value"),
            "unit": df.get("unit"),
            "obs_status": df.get("obs_status"),
            "decimal": df.get("decimal"),
        }
    )
    return out


def fetch_countries(logger) -> pd.DataFrame:
    payload = get_json(
        f"{BASE_URL}/country",
        logger,
        params={"format": "json", "per_page": 400},
    )
    rows = payload[1] if isinstance(payload, list) and len(payload) == 2 else []
    df = pd.json_normalize(rows)
    return pd.DataFrame(
        {
            "iso_code": df.get("id"),
            "iso2_code": df.get("iso2Code"),
            "country": df.get("name"),
            "region": df.get("region.value"),
            "region_code": df.get("region.id"),
            "income_group": df.get("incomeLevel.value"),
            "income_group_code": df.get("incomeLevel.id"),
            "lending_type": df.get("lendingType.value"),
            "capital_city": df.get("capitalCity"),
            "longitude": df.get("longitude"),
            "latitude": df.get("latitude"),
        }
    )


def main() -> None:
    logger = setup_logging("02_download_worldbank")
    frames = []
    for code, name in INDICATORS.items():
        df = fetch_indicator(code, name, logger)
        raw_path = RAW_DIR / "worldbank" / f"{code}.csv"
        save_csv(df, raw_path)
        frames.append(df)
        logger.info("Saved %s rows for %s", len(df), code)

    countries = fetch_countries(logger)
    save_csv(countries, RAW_DIR / "worldbank" / "worldbank_countries.csv")
    logger.info("Saved %s World Bank country metadata rows", len(countries))

    long_df = pd.concat(frames, ignore_index=True)
    save_csv(long_df, RAW_DIR / "worldbank" / "worldbank_indicators_long.csv")

    write_manifest(
        RAW_DIR / "worldbank" / "source_manifest.json",
        {
            "source": "World Bank World Development Indicators API",
            "api": BASE_URL,
            "documentation_url": "https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation",
            "indicators": INDICATORS,
            "date_range": f"{START_YEAR}-{END_YEAR}",
            "notes": "One raw CSV per indicator plus a consolidated long table and country metadata.",
        },
    )
    logger.info("World Bank raw download complete")


if __name__ == "__main__":
    main()
