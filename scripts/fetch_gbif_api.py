#!/usr/bin/env python3
"""GBIF açık API'sinden doğrudan örnek çeker. Hesap ve büyük indirme gerekmez.

Tam GBIF indirmesi yüzlerce GB olabilir; bu betik onun yerine her yıl için
sınırlı sayıda kayıt ister ve sergi formatına yazar. Ek kütüphane gerekmez.

Önce her yılın gerçek kayıt sayısını öğrenir, sonra toplam kotayı yıllara
orantılı dağıtır. Böylece 1960'ın seyrekliği ile 2020'nin yoğunluğu arasındaki
fark gerçek veriden gelir. Her yıla küçük bir taban kota da verilir.

Kullanım (kendi bilgisayarınızda, internet bağlantısıyla):
    python3 scripts/fetch_gbif_api.py                  # 1950-2024, toplam 60 bin
    python3 scripts/fetch_gbif_api.py --total 100000
    python3 scripts/fetch_gbif_api.py --year-min 2000

Kısıtlar: API tek istekte en çok 300 kayıt verir ve bir sorgu için 100.000
kaydın ötesine sayfalamaz. Yıl başına ayrı sorgu attığımız için bu sınır
sorun olmaz. 60 bin kayıt yaklaşık 250 istek, birkaç dakika sürer.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from common import CLASSES, map_class, write_outputs

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.gbif.org/v1/occurrence/search"
PAGE = 300  # API'nin izin verdiği en büyük sayfa


def fetch(params: dict, retries: int = 4) -> dict:
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError) as e:
            wait = 2 ** attempt
            print(f"  hata: {e}; {wait}s sonra tekrar", file=sys.stderr)
            time.sleep(wait)
    raise SystemExit("GBIF API'ye ulaşılamadı. İnternet bağlantısını kontrol edin.")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year-min", type=int, default=1950)
    ap.add_argument("--year-max", type=int, default=2024)
    ap.add_argument("--total", type=int, default=60000, help="hedef toplam kayıt")
    ap.add_argument("--min-per-year", type=int, default=30, help="her yıl için taban kota")
    ap.add_argument("--max-per-year", type=int, default=9000, help="tek yıl için üst sınır")
    ap.add_argument("--country", default="TR")
    args = ap.parse_args()

    base = {
        "country": args.country,
        "hasCoordinate": "true",
        "hasGeospatialIssue": "false",
        "occurrenceStatus": "PRESENT",
        "limit": PAGE,
    }

    years = list(range(args.year_min, args.year_max + 1))

    # 1) Her yılın kayıt sayısı (limit=0 ile yalnızca sayaç gelir)
    counts = {}
    for y in years:
        counts[y] = fetch({**base, "year": y, "limit": 0}).get("count", 0)
        time.sleep(0.1)
    total_available = sum(counts.values())
    print(f"{args.country}: {total_available} kayıt mevcut", file=sys.stderr)
    if total_available == 0:
        raise SystemExit("Bu filtrelerle kayıt yok.")

    # 2) Orantılı kota, taban ve tavanla
    quota = {}
    for y in years:
        q = round(args.total * counts[y] / total_available)
        q = max(args.min_per_year, q) if counts[y] > 0 else 0
        quota[y] = min(q, counts[y], args.max_per_year)

    # 3) Çek
    obs = []
    for y in years:
        got, offset = 0, 0
        while got < quota[y]:
            data = fetch({**base, "year": y, "offset": offset})
            results = data.get("results", [])
            if not results:
                break
            for rec in results:
                lat, lon = rec.get("decimalLatitude"), rec.get("decimalLongitude")
                if lat is None or lon is None:
                    continue
                if not (25.0 <= lon <= 45.5 and 35.0 <= lat <= 42.5):
                    continue
                cls = map_class(rec.get("class"), rec.get("kingdom"))
                obs.append([round(lon, 4), round(lat, 4), y, cls])
                got += 1
                if got >= quota[y]:
                    break
            offset += PAGE
            if data.get("endOfRecords"):
                break
            time.sleep(0.2)  # API'ye nazik davran
        print(f"{y}: {got} alındı / {counts[y]} mevcut", file=sys.stderr)

    if not obs:
        raise SystemExit("Hiç kayıt gelmedi.")

    obs.sort(key=lambda o: o[2])
    years = [o[2] for o in obs]
    meta = {
        "source": f"GBIF API, {args.country}, {len(obs)} örnek / {total_available} kayıt, "
                  f"{time.strftime('%Y-%m-%d')}",
        "classes": CLASSES,
        "yearMin": min(years),
        "yearMax": max(years),
        "count": len(obs),
    }
    write_outputs(ROOT / "data", meta, obs)


if __name__ == "__main__":
    main()
