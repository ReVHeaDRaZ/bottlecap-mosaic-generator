# Cap & Cask — Bottle Cap Mosaic Workshop

A dependency-free browser app for turning an image into a bottle cap mosaic. Choose the caps in your collection, adjust image detail and physical cap diameter (default 24 mm), and preview round, square, or hexagonal caps with custom spacing and gap colors. The cap gap is shown in both percent and millimetres. For a round barrel-top design, choose a common hobby or wine barrel lid size, or enter a custom diameter; the app fits a cap layout to that size. Zoom and reposition the image inside the circular crop. The print template is a high-resolution placement guide; print it at actual size using the displayed dimensions. See the cap-by-cap inventory, compare the original image, and download a quick preview or print-ready PNG.

## Run locally

Serve this folder over HTTP so the browser can load the bottle cap collection:

```powershell
py -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000). No dependencies or build step are required.
