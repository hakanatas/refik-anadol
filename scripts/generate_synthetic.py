#!/usr/bin/env python3
"""Sentetik biyoçeşitlilik gözlemleri üretir.

Gerçek GBIF verisi indirmeden önce sergiyi geliştirmek için kullanılır.
Çıktı formatı prepare_gbif.py ile birebir aynıdır; gerçek veriyi yerine
koyduğunuzda sketch.js hiç değişmez.

Kullanım:
    python3 scripts/generate_synthetic.py            # 40 bin kayıt
    python3 scripts/generate_synthetic.py -n 80000 --seed 7
"""
import argparse
import json
import math
import random
from pathlib import Path

from common import CLASSES, write_outputs

ROOT = Path(__file__).resolve().parent.parent
OUTLINE = ROOT / "data" / "turkey_outline.json"


def point_in_polygon(x: float, y: float, poly: list) -> bool:
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y):
            x_cross = (xj - xi) * (y - yi) / (yj - yi) + xi
            if x < x_cross:
                inside = not inside
        j = i
    return inside


# Biyoçeşitlilik sıcak noktaları: (boylam, enlem, yarıçap_derece, ağırlık, sınıf eğilimi)
# Kaba ekolojik sezgiye dayanır: Karadeniz ormanları, Ege kıyısı, Toroslar,
# Doğu Anadolu yaylaları, Hatay, Göller Yöresi, Kızılırmak deltası (kuşlar).
HOTSPOTS = [
    (41.0, 41.2, 1.2, 1.4, {0: 0.3, 1: 0.4, 2: 0.15, 3: 0.1, 4: 0.05}),  # Kaçkarlar, Artvin
    (36.0, 41.6, 0.8, 1.2, {0: 0.6, 1: 0.15, 2: 0.1, 3: 0.05, 4: 0.1}),  # Kızılırmak deltası
    (29.1, 41.1, 0.9, 1.8, {0: 0.35, 1: 0.3, 2: 0.2, 3: 0.05, 4: 0.1}),  # İstanbul (gözlemci yoğun)
    (27.1, 38.4, 1.0, 1.5, {0: 0.3, 1: 0.35, 2: 0.2, 3: 0.05, 4: 0.1}),  # İzmir, Ege
    (30.7, 36.9, 1.0, 1.3, {0: 0.25, 1: 0.35, 2: 0.25, 3: 0.05, 4: 0.1}),  # Antalya, Toroslar
    (32.8, 39.9, 0.9, 1.2, {0: 0.3, 1: 0.35, 2: 0.2, 3: 0.05, 4: 0.1}),  # Ankara
    (36.2, 36.4, 0.7, 0.9, {0: 0.3, 1: 0.35, 2: 0.2, 3: 0.05, 4: 0.1}),  # Hatay, Amanoslar
    (30.5, 37.8, 0.8, 0.8, {0: 0.4, 1: 0.3, 2: 0.15, 3: 0.05, 4: 0.1}),  # Göller Yöresi
    (43.3, 38.5, 1.2, 0.7, {0: 0.35, 1: 0.35, 2: 0.1, 3: 0.15, 4: 0.05}),  # Van
    (39.7, 39.0, 1.5, 0.6, {0: 0.25, 1: 0.4, 2: 0.1, 3: 0.2, 4: 0.05}),  # Doğu Anadolu yaylaları
    (28.9, 40.2, 0.8, 0.9, {0: 0.3, 1: 0.35, 2: 0.2, 3: 0.05, 4: 0.1}),  # Bursa, Uludağ
    (35.5, 37.0, 0.8, 0.7, {0: 0.4, 1: 0.25, 2: 0.2, 3: 0.05, 4: 0.1}),  # Çukurova
]
BASE_MIX = {0: 0.3, 1: 0.3, 2: 0.2, 3: 0.08, 4: 0.12}


def sample_year(rng: random.Random, y0: int, y1: int) -> int:
    """Gözlem sayısı yıllar içinde üstel artar: vatandaş bilimi etkisi."""
    span = y1 - y0
    # 0..1 arası, üstel ağırlıklı
    u = rng.random()
    t = math.log1p(u * (math.e ** 4 - 1)) / 4  # 0..1, geç yıllara yığılır
    return y0 + int(t * span)


def weighted_choice(rng: random.Random, weights: dict) -> int:
    r = rng.random() * sum(weights.values())
    acc = 0.0
    for k, w in weights.items():
        acc += w
        if r <= acc:
            return k
    return list(weights)[-1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("-n", type=int, default=40000, help="kayıt sayısı")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--year-min", type=int, default=1950)
    ap.add_argument("--year-max", type=int, default=2024)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    outline = json.loads(OUTLINE.read_text(encoding="utf-8"))
    outer, marmara = outline["outer"], outline["marmara"]
    lons = [p[0] for p in outer]
    lats = [p[1] for p in outer]
    lon0, lon1, lat0, lat1 = min(lons), max(lons), min(lats), max(lats)

    total_w = sum(h[3] for h in HOTSPOTS)
    obs = []
    while len(obs) < args.n:
        # %55 sıcak noktalardan, %45 ülke geneline dağınık
        if rng.random() < 0.55:
            r = rng.random() * total_w
            acc = 0.0
            for h in HOTSPOTS:
                acc += h[3]
                if r <= acc:
                    break
            lon_c, lat_c, rad, _, mix = h
            # Gauss dağılımı, yarıçap = 1 sigma
            lon = rng.gauss(lon_c, rad)
            lat = rng.gauss(lat_c, rad * 0.75)
        else:
            lon = rng.uniform(lon0, lon1)
            lat = rng.uniform(lat0, lat1)
            mix = BASE_MIX
        if not point_in_polygon(lon, lat, outer) or point_in_polygon(lon, lat, marmara):
            continue
        year = sample_year(rng, args.year_min, args.year_max)
        cls = weighted_choice(rng, mix)
        obs.append([round(lon, 4), round(lat, 4), year, cls])

    obs.sort(key=lambda o: o[2])
    meta = {
        "source": "sentetik (scripts/generate_synthetic.py)",
        "classes": CLASSES,
        "yearMin": args.year_min,
        "yearMax": args.year_max,
        "count": len(obs),
    }
    write_outputs(ROOT / "data", meta, obs)


if __name__ == "__main__":
    main()
