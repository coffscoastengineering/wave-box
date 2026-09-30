# Claude Box Template Generator

Offline browser tool for generating full-size Claude Box cutting templates from a Fusion-derived master model.

The app lets you adjust box height, depth, carcass width, timber thicknesses, side stand-off gap, and A-series paper size. Height/depth proportions are locked by default, with material presets for safer timber choices. It exports:

- Tiled printable PDF templates with a scale-check square
- SVG cut paths with labels and dowel holes
- DXF R12 cut paths, holes, and labels for CAD/CNC workflows
- A cut list and assembly notes

## Use

```sh
npm install
npm test
npm run build
```

Open `dist/claude-box-generator.html` in a browser. The generated file is standalone and works offline.

For local development:

```sh
npm run serve
```

Then open `http://127.0.0.1:8765/src/ui/index.html`. The built app is still the recommended artifact for sharing.

## Notes

All geometry, labels, cut lists, and exports are metric. Template dimensions are in millimetres throughout.
