from __future__ import annotations

from pipeline_utils import RAW_DIR, download_file, setup_logging, write_manifest


DATA_URL = "https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv"
CODEBOOK_URL = "https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-codebook.csv"


def main() -> None:
    logger = setup_logging("03_download_owid_co2")
    data_path = RAW_DIR / "owid" / "owid-co2-data.csv"
    codebook_path = RAW_DIR / "owid" / "owid-co2-codebook.csv"

    download_file(DATA_URL, data_path, logger)
    download_file(CODEBOOK_URL, codebook_path, logger)

    write_manifest(
        RAW_DIR / "owid" / "source_manifest.json",
        {
            "source": "Our World in Data CO2 and Greenhouse Gas Emissions",
            "repository": "https://github.com/owid/co2-data",
            "data_url": DATA_URL,
            "codebook_url": CODEBOOK_URL,
            "notes": "Main CO2 and greenhouse gas emissions CSV plus codebook.",
        },
    )
    logger.info("OWID CO2 raw download complete")


if __name__ == "__main__":
    main()
