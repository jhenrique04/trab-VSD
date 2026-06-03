from __future__ import annotations

import subprocess
import sys
from pathlib import Path


SCRIPTS = [
    "01_download_undp.py",
    "02_download_worldbank.py",
    "03_download_owid_co2.py",
    "04_clean_undp.py",
    "05_clean_worldbank.py",
    "06_clean_owid.py",
    "07_join_final_dataset.py",
    "08_generate_figures.py",
    "09_prepare_streamlit_data.py",
    "11_prepare_threejs_globe_data.py",
    "12_download_climate_trace.py",
    "13_prepare_narrative_data.py",
]


def main() -> None:
    scripts_dir = Path(__file__).resolve().parent
    for script in SCRIPTS:
        print(f"\n=== Running {script} ===", flush=True)
        subprocess.run([sys.executable, str(scripts_dir / script)], check=True)


if __name__ == "__main__":
    main()
