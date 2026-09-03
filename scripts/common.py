"""Ortak yardımcılar: sınıf eşlemesi ve çıktı yazımı.

Veri formatı (data/observations.json ve data/observations.js):
{
  "meta": {
    "source": "...",
    "classes": ["Kuşlar", "Bitkiler", "Böcekler", "Memeliler", "Diğer"],
    "yearMin": 1950, "yearMax": 2024, "count": N
  },
  "obs": [[boylam, enlem, yıl, sınıfIndeksi, türIndeksi], ...]
}
"species" listesi meta içinde durur; her kayıt bu listeye indeksle bağlanır (5. eleman,
isteğe bağlı). Kompakt dizi kullanılır çünkü 100 bin kaydı tarayıcıya hızlı yüklemek gerekir.
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


def species_name(row: dict) -> str:
    """GBIF satırından gösterilecek tür adı: species, yoksa scientificName'in ilk iki kelimesi."""
    sp = (row.get("species") or "").strip()
    if sp:
        return sp
    sci = (row.get("scientificName") or "").strip()
    return " ".join(sci.split()[:2]) if sci else ""


def index_species(records: list) -> tuple:
    """[..., sınıf, 'Tür adı'] kayıtlarını [..., sınıf, indeks] yapar; tür listesini döndürür."""
    names, idx = [], {}
    out = []
    for r in records:
        name = r[4] if len(r) > 4 else ""
        if name not in idx:
            idx[name] = len(names)
            names.append(name)
        out.append(r[:4] + [idx[name]])
    return names, out


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
