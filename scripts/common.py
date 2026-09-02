"""Ortak yardımcılar: sınıf eşlemesi ve çıktı yazımı.

Veri formatı (data/observations.json ve data/observations.js):
{
  "meta": {
    "source": "...",
    "classes": ["Kuşlar", "Bitkiler", "Böcekler", "Memeliler", "Diğer"],
    "yearMin": 1950, "yearMax": 2024, "count": N
  },
  "obs": [[boylam, enlem, yıl, sınıfIndeksi], ...]
}
Kompakt dizi kullanılır çünkü 100 bin kaydı tarayıcıya hızlı yüklemek gerekir.
"""
import json
from pathlib import Path

# Görselde kullanılan sınıflar. Sıra önemli: indeks olarak saklanır.
CLASSES = ["Kuşlar", "Bitkiler", "Böcekler", "Memeliler", "Diğer"]

# GBIF taksonomik alanlarından bizim sınıflarımıza eşleme.
# GBIF "class" sütunu: Aves, Insecta, Mammalia, ...  "kingdom" sütunu: Plantae, Animalia, ...
def map_class(gbif_class: str, gbif_kingdom: str) -> int:
    c = (gbif_class or "").strip()
    k = (gbif_kingdom or "").strip()
    if c == "Aves":
        return 0
    if k == "Plantae":
        return 1
    if c == "Insecta":
        return 2
    if c == "Mammalia":
        return 3
    return 4


def write_outputs(out_dir: Path, meta: dict, obs: list) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {"meta": meta, "obs": obs}
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    (out_dir / "observations.json").write_text(text, encoding="utf-8")
    # index.html dosyası file:// ile açıldığında fetch/loadJSON engellenir.
    # Bu yüzden aynı veriyi bir JS dosyası olarak da yazıyoruz.
    (out_dir / "observations.js").write_text(
        "// Otomatik üretildi, elle düzenlemeyin. scripts/ klasörüne bakın.\n"
        "window.OBSERVATIONS = " + text + ";\n",
        encoding="utf-8",
    )
    print(f"{len(obs)} kayıt yazıldı -> {out_dir / 'observations.json'} ve observations.js")
