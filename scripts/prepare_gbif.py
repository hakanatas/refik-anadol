#!/usr/bin/env python3
"""GBIF indirmesini sergi formatına çevirir.

1. https://www.gbif.org/occurrence/search adresine gidin (ücretsiz hesap gerekir).
2. Filtreler: Country = Turkey, Has coordinate = true, Occurrence status = present.
   İsterseniz Year aralığı da ekleyin.
3. Download -> "Simple" (tab ile ayrılmış CSV). Zip'i açın.
4. Çalıştırın:
       python3 scripts/prepare_gbif.py yol/0012345-2409.csv -n 80000

Dosya milyonlarca satır olabilir; betik satır satır okur ve rezervuar
örneklemesiyle rastgele N kayıt seçer. Bellek büyümez.
"""
import argparse
import csv
import random
import sys
from pathlib import Path

from common import CLASSES, index_species, map_class, species_name, write_outputs

ROOT = Path(__file__).resolve().parent.parent
csv.field_size_limit(sys.maxsize)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("-n", type=int, default=80000, help="örneklenecek kayıt sayısı")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--year-min", type=int, default=1950)
    ap.add_argument("--year-max", type=int, default=2100)
    ap.add_argument("--doi", default="10.15468/dl.jq9mj7",
                    help="GBIF indirmesinin DOI'si; ekranda ve meta'da kaynak olarak görünür")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    reservoir = []
    seen = 0
    skipped = 0

    with open(args.csv_path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        for row in reader:
            try:
                lat = float(row["decimalLatitude"])
                lon = float(row["decimalLongitude"])
                year = int(float(row["year"]))
            except (KeyError, ValueError, TypeError):
                skipped += 1
                continue
            if not (args.year_min <= year <= args.year_max):
                skipped += 1
                continue
            # Türkiye'nin kaba kutusu; sınır dışı hatalı koordinatları at
            if not (25.0 <= lon <= 45.5 and 35.0 <= lat <= 42.5):
                skipped += 1
                continue
            cls = map_class(row.get("class"), row.get("kingdom"))
            rec = [round(lon, 4), round(lat, 4), year, cls, species_name(row)]
            seen += 1
            if len(reservoir) < args.n:
                reservoir.append(rec)
            else:
                j = rng.randrange(seen)
                if j < args.n:
                    reservoir[j] = rec
            if seen % 500000 == 0:
                print(f"  {seen} geçerli satır okundu...", file=sys.stderr)

    if not reservoir:
        sys.exit("Hiç geçerli kayıt bulunamadı. Sütun adlarını kontrol edin.")

    reservoir.sort(key=lambda o: o[2])
    species, reservoir = index_species(reservoir)
    years = [o[2] for o in reservoir]
    meta = {
        "source": f"GBIF Occurrence Download doi.org/{args.doi} · {seen} kayıttan {len(reservoir)} örnek",
        "citation": f"GBIF.org (2 September 2026) GBIF Occurrence Download https://doi.org/{args.doi}",
        "classes": CLASSES,
        "species": species,
        "yearMin": min(years),
        "yearMax": max(years),
        "count": len(reservoir),
    }
    print(f"{seen} geçerli, {skipped} atlanan satır, {len(species)} farklı tür", file=sys.stderr)
    write_outputs(ROOT / "data", meta, reservoir)


if __name__ == "__main__":
    main()
