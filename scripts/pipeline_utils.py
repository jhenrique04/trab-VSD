from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import requests


PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
INTERIM_DIR = DATA_DIR / "interim"
PROCESSED_DIR = DATA_DIR / "processed"
TABLEAU_DIR = DATA_DIR / "tableau"
FIGURES_DIR = PROJECT_DIR / "figures"
DOCS_DIR = PROJECT_DIR / "docs"
LOGS_DIR = PROJECT_DIR / "logs"

START_YEAR = 1990
END_YEAR = 2023

HTTP_HEADERS = {
    "User-Agent": "dev-planeta-tableau-data-pipeline/1.0 (+academic project)",
    "Accept": "*/*",
}

ISO3_RE = re.compile(r"^[A-Z]{3}$")


def ensure_project_dirs() -> None:
    for path in [
        RAW_DIR / "undp",
        RAW_DIR / "worldbank",
        RAW_DIR / "owid",
        INTERIM_DIR,
        PROCESSED_DIR,
        TABLEAU_DIR,
        FIGURES_DIR,
        DOCS_DIR,
        LOGS_DIR,
    ]:
        path.mkdir(parents=True, exist_ok=True)


def setup_logging(script_name: str) -> logging.Logger:
    ensure_project_dirs()
    logger = logging.getLogger(script_name)
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")

    file_handler = logging.FileHandler(LOGS_DIR / f"{script_name}.log", encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)
    return logger


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def is_iso3(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    return bool(ISO3_RE.match(value.strip().upper()))


def clean_iso(series: pd.Series) -> pd.Series:
    return series.astype("string").str.strip().str.upper()


def to_numeric(series: pd.Series) -> pd.Series:
    cleaned = (
        series.astype("string")
        .str.strip()
        .replace({"": pd.NA, "..": pd.NA, "NA": pd.NA, "nan": pd.NA})
    )
    return pd.to_numeric(cleaned, errors="coerce")


def download_file(url: str, dest: Path, logger: logging.Logger, retries: int = 3) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            logger.info("Downloading %s -> %s", url, dest)
            with requests.get(url, headers=HTTP_HEADERS, stream=True, timeout=90) as response:
                response.raise_for_status()
                with dest.open("wb") as handle:
                    for chunk in response.iter_content(chunk_size=1024 * 1024):
                        if chunk:
                            handle.write(chunk)
            logger.info("Saved %s (%s bytes)", dest, dest.stat().st_size)
            return dest
        except Exception as exc:  # pragma: no cover - network failures are environment-specific.
            last_error = exc
            logger.warning("Attempt %s/%s failed: %s", attempt, retries, exc)
            time.sleep(2 * attempt)
    raise RuntimeError(f"Could not download {url}: {last_error}") from last_error


def get_json(
    url: str,
    logger: logging.Logger,
    params: dict[str, Any] | None = None,
    retries: int = 3,
) -> Any:
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            logger.info("GET %s params=%s", url, params or {})
            response = requests.get(url, params=params, headers=HTTP_HEADERS, timeout=90)
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # pragma: no cover - network failures are environment-specific.
            last_error = exc
            logger.warning("GET attempt %s/%s failed: %s", attempt, retries, exc)
            time.sleep(2 * attempt)
    raise RuntimeError(f"Could not fetch JSON from {url}: {last_error}") from last_error


def write_manifest(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"generated_at": now_iso(), **payload}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def save_csv(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, encoding="utf-8")


def read_csv(path: Path, **kwargs: Any) -> pd.DataFrame:
    try:
        return pd.read_csv(path, encoding="utf-8", low_memory=False, **kwargs)
    except UnicodeDecodeError:
        return pd.read_csv(path, encoding="latin1", low_memory=False, **kwargs)


def drop_duplicate_country_year(df: pd.DataFrame, logger: logging.Logger, name: str) -> pd.DataFrame:
    duplicates = df.duplicated(["iso_code", "year"]).sum()
    if duplicates:
        logger.warning("%s has %s duplicate iso_code/year rows; keeping first non-null order", name, duplicates)
    return df.drop_duplicates(["iso_code", "year"], keep="first").reset_index(drop=True)


def valid_iso_filter(df: pd.DataFrame, column: str = "iso_code") -> pd.Series:
    return df[column].map(is_iso3).fillna(False)
