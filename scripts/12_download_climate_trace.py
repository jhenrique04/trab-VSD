"""Baixa emissões por instalação (asset-level) do Climate TRACE e grava arquivos
compactos por país para o mapa de granularidade (deck.gl) do produto web.

A API v6 do Climate TRACE retorna assets ordenados por emissão decrescente, então
um `limit=N` por país equivale aos N maiores emissores. Geramos um arquivo pequeno
por país (`web/threejs-globe/data/facilities/<ISO3>.json`) com lon/lat, setor e
emissão (CO2e 100yr), além de um `index.json` com a cobertura.

A API é beta e tem CORS aberto; o mapa web usa estes arquivos estáticos e cai para
a API ao vivo quando o arquivo não existe.

Uso:
    python scripts/12_download_climate_trace.py            # todos os países do globo
    python scripts/12_download_climate_trace.py --countries BRA USA CHN
    python scripts/12_download_climate_trace.py --force    # regera arquivos existentes
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

from pipeline_utils import LOGS_DIR, get_json, now_iso, setup_logging  # noqa: F401

PROJECT_DIR = Path(__file__).resolve().parents[1]
GLOBE_JSON_PATH = PROJECT_DIR / "web" / "threejs-globe" / "data" / "dev_planet_globe.json"
FACILITIES_DIR = PROJECT_DIR / "web" / "threejs-globe" / "data" / "facilities"

API_URL = "https://api.climatetrace.org/v6/assets"
# Fontes PONTUAIS de CO2 (chaminés reais). Excluímos "transportation" porque
# transporte rodoviário/marítimo/aéreo é difuso e o Climate TRACE o coloca num
# ponto representativo (centroide), o que empilha tudo num único local no mapa.
SECTORS = [
    "power",
    "fossil-fuel-operations",
    "manufacturing",
    "mineral-extraction",
]
# Subsetores difusos que escapam dos setores acima e devem ser descartados.
EXCLUDE_SUBSECTORS = {
    "road-transportation",
    "domestic-shipping",
    "international-shipping",
    "domestic-aviation",
    "international-aviation",
}
TOP_N_PER_COUNTRY = 80
REQUEST_SLEEP_SECONDS = 0.2


def globe_iso_codes() -> list[str]:
    rows = json.loads(GLOBE_JSON_PATH.read_text(encoding="utf-8"))
    return sorted({row["iso_code"] for row in rows if isinstance(row.get("iso_code"), str)})


def asset_emissions(asset: dict[str, Any]) -> float | None:
    summaries = asset.get("EmissionsSummary") or []
    quantities = [
        s.get("EmissionsQuantity")
        for s in summaries
        if isinstance(s.get("EmissionsQuantity"), (int, float))
    ]
    return max(quantities) if quantities else None


def trim_asset(asset: dict[str, Any]) -> dict[str, Any] | None:
    if (asset.get("Sector") or "") in EXCLUDE_SUBSECTORS:
        return None
    centroid = asset.get("Centroid") or {}
    geometry = centroid.get("Geometry")
    if not (isinstance(geometry, list) and len(geometry) == 2):
        return None
    lon, lat = geometry
    if not (isinstance(lon, (int, float)) and isinstance(lat, (int, float))):
        return None
    emissions = asset_emissions(asset)
    if emissions is None or emissions <= 0:
        return None
    return {
        "id": asset.get("Id"),
        "name": asset.get("Name") or "Instalação sem nome",
        "sector": asset.get("Sector") or "outros",
        "type": asset.get("AssetType") or "",
        "lon": round(float(lon), 5),
        "lat": round(float(lat), 5),
        "emissions": round(float(emissions), 1),
    }


def fetch_country(iso: str, logger) -> list[dict[str, Any]]:
    params = {
        "countries": iso,
        "sectors": ",".join(SECTORS),
        "limit": TOP_N_PER_COUNTRY,
    }
    payload = get_json(API_URL, logger, params=params, retries=3)
    assets = payload.get("assets") if isinstance(payload, dict) else None
    if not assets:
        return []
    trimmed = [a for a in (trim_asset(asset) for asset in assets) if a]
    trimmed.sort(key=lambda a: a["emissions"], reverse=True)
    return trimmed[:TOP_N_PER_COUNTRY]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--countries", nargs="*", help="ISO3 específicos (default: todos do globo)")
    parser.add_argument("--force", action="store_true", help="regera arquivos já existentes")
    args = parser.parse_args()

    logger = setup_logging("12_download_climate_trace")
    FACILITIES_DIR.mkdir(parents=True, exist_ok=True)

    iso_codes = [c.upper() for c in args.countries] if args.countries else globe_iso_codes()
    logger.info("Países a processar: %s", len(iso_codes))

    index: dict[str, dict[str, Any]] = {}
    global_assets: list[dict[str, Any]] = []
    index_path = FACILITIES_DIR / "index.json"
    if index_path.exists():
        try:
            index = json.loads(index_path.read_text(encoding="utf-8")).get("countries", {})
        except json.JSONDecodeError:
            index = {}

    for position, iso in enumerate(iso_codes, start=1):
        out_path = FACILITIES_DIR / f"{iso}.json"
        if out_path.exists() and not args.force:
            logger.info("[%s/%s] %s já existe, pulando", position, len(iso_codes), iso)
            continue
        try:
            assets = fetch_country(iso, logger)
        except Exception as exc:  # noqa: BLE001 - falhas de rede são específicas do ambiente
            logger.warning("[%s/%s] %s falhou: %s", position, len(iso_codes), iso, exc)
            continue

        if not assets:
            logger.info("[%s/%s] %s sem assets, pulando", position, len(iso_codes), iso)
            continue

        record = {
            "iso_code": iso,
            "generated_at": now_iso(),
            "gas": "co2e_100yr",
            "sectors": SECTORS,
            "assets": assets,
        }
        out_path.write_text(
            json.dumps(record, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        index[iso] = {
            "count": len(assets),
            "total_emissions": round(sum(a["emissions"] for a in assets), 1),
        }
        for asset in assets:
            global_assets.append({**asset, "iso": iso})
        logger.info(
            "[%s/%s] %s salvo (%s assets, %.0f t)",
            position,
            len(iso_codes),
            iso,
            len(assets),
            index[iso]["total_emissions"],
        )
        time.sleep(REQUEST_SLEEP_SECONDS)

    index_path.write_text(
        json.dumps({"generated_at": now_iso(), "countries": index}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # Arquivo global (todas as instalações pontuais do mundo) para a visão padrão
    # do mapa: o usuário vê os emissores espalhados pelo planeta de uma vez.
    if global_assets:
        global_assets.sort(key=lambda a: a["emissions"], reverse=True)
        global_path = FACILITIES_DIR / "facilities_global.json"
        global_path.write_text(
            json.dumps(
                {"generated_at": now_iso(), "gas": "co2e_100yr", "assets": global_assets},
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )
        logger.info("Salvo global %s assets=%s", global_path, len(global_assets))

    logger.info("Concluído. Países com arquivo: %s", len(index))


if __name__ == "__main__":
    main()
