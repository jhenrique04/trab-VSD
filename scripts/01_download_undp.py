from __future__ import annotations

from pipeline_utils import RAW_DIR, download_file, setup_logging, write_manifest


UNDP_URLS = [
    "https://hdr.undp.org/sites/default/files/2025_HDR/HDR25_Composite_indices_complete_time_series.csv",
    "https://hdr.undp.org/sites/default/files/2023-24_HDR/HDR23-24_Composite_indices_complete_time_series.csv",
]


def main() -> None:
    logger = setup_logging("01_download_undp")
    output = RAW_DIR / "undp" / "HDR25_Composite_indices_complete_time_series.csv"

    downloaded_url = None
    last_error: Exception | None = None
    for url in UNDP_URLS:
        try:
            download_file(url, output, logger)
            downloaded_url = url
            break
        except Exception as exc:
            logger.warning("UNDP URL failed: %s", exc)
            last_error = exc

    if downloaded_url is None:
        raise RuntimeError(f"All UNDP download URLs failed: {last_error}") from last_error

    write_manifest(
        RAW_DIR / "undp" / "source_manifest.json",
        {
            "source": "UNDP Human Development Reports",
            "file": output.name,
            "url": downloaded_url,
            "documentation_urls": [
                "https://hdr.undp.org/data-center",
                "https://hdr.undp.org/data-center/documentation-and-downloads",
                "https://hdr.undp.org/data-center/human-development-index",
            ],
            "notes": "All composite indices and components complete time series, prioritized for 1990-2023.",
        },
    )
    logger.info("UNDP raw download complete")


if __name__ == "__main__":
    main()
