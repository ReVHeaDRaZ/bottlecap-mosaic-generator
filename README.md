# Cap & Cask — Bottle Cap Mosaic Workshop

A dependency-free browser app for turning an image into a bottle cap mosaic. Choose the caps in your collection, adjust image detail and physical cap diameter, and preview round, square, or hexagonal caps with custom spacing and gap colors. Choose a rectangular layout or a circular barrel-top design; circular mosaics use a centered square crop and download with transparent corners. See the cap-by-cap inventory, compare the original image, and download a standard or print-ready PNG.

## Run locally

Serve this folder over HTTP so the browser can load the bottle cap collection:

```powershell
py -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000). No dependencies or build step are required.
