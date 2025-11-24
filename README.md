# Tenochtitlan – 3D Scene (Three.js + Vite)

Leitfaden, um das Projekt lokal aufzusetzen, zu starten und zu bauen.

## Voraussetzungen
- Node.js 18 oder neuer (Vite 5 verlangt mindestens v18)
- npm (wird mit Node ausgeliefert)

## Installation
1) Repository/Assets bereitstellen (die großen `.glb`-Dateien liegen im Ordner `public/models`).
2) Abhängigkeiten installieren:
   ```bash
   npm install
   ```

## Entwicklung starten
Lokalen Dev-Server mit Hot-Reload auf Port 5173 starten:
```bash
npm run dev
```
Die App ist danach unter `http://localhost:5173` erreichbar.


## Daten & Platzierungen
- Platzierungsdaten: `public/data/placements.json`
- Während `npm run dev` läuft, stehen sie auch unter `/api/placements` (Vite-Middleware) bereit.
- Änderungen am JSON werden beim nächsten Reload übernommen.

## Projektstruktur (Kurzüberblick)
- `src/` – Quellcode (Three.js-Szenen, UI, Utilitys)
- `public/` – Statische Assets (Modelle, Texturen, Platzierungen)
- `vite.config.js` – Vite-Konfiguration inkl. kleiner Placements-API


## Hinweise zu großen Assets
Die GLB-Dateien sind groß. Falls der Start lange dauert, prüfen:
- Genug Speicherplatz und RAM vorhanden.
- Browser-Tab nicht durch andere, speicherhungrige Seiten blockiert.
