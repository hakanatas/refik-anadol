# Veri kaynağı

Sergideki tür gözlemleri GBIF (Global Biodiversity Information Facility) üzerinden alınmıştır.

**Atıf (sergi metnine, portfolyoya ve yayınlara aynen yazın):**

> GBIF.org (2 September 2026) GBIF Occurrence Download https://doi.org/10.15468/dl.jq9mj7

Filtreler: Country = Turkey, Has coordinate = true, Has geospatial issue = false,
Occurrence status = present, Year = 1950-2024. Format: Simple (tab ile ayrılmış CSV).

Ham CSV depoya konmaz (`.gitignore` içinde), yalnızca `scripts/prepare_gbif.py`
ile üretilen örneklenmiş `observations.json` / `observations.js` dosyaları tutulur.
