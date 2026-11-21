# Lunar 3D models

The viewer loads one self-contained GLB per selection. Each file uses a Y-up coordinate system. The bounding box is centered on the origin and its half-diagonal has unit length.

| File | Object and scope | Geometry and attribution |
| --- | --- | --- |
| apollo11.glb | Apollo Lunar Module, a representative two-stage vehicle | [NASA / Michael D. Carbajal](https://science.nasa.gov/3d-resources/apollo-lunar-module/) |
| luna17.glb | Lunokhod 1 rover in deployed configuration | Simplified reconstruction by [Space Radar](https://models.spaceradar.ai/lunokhod-1/) |
| change4.glb | Chang’e 4 lander | Simplified reconstruction by [Space Radar](https://models.spaceradar.ai/change-4/) |
| gateway.glb | Gateway core configuration published in March 2025 | [NASA / JSC / Gateway Program Office](https://science.nasa.gov/3d-resources/gateway-lunar-space-station/), Alberto G. Bertolin and Bradley W. Reynolds |
| ilrs.glb | Conceptual reconstruction of surface science, mobility, communications and power systems | Original Rassvet schematic informed by the [CNSA / Roscosmos partnership guide](https://www.cnsa.gov.cn/english/n6465645/n6465648/c6812150/content.html). Module shapes, arrangement and proportions are illustrative. |

The NASA models are used for educational visualization under the [NASA media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). Space Radar identifies its two reconstructions as MIT-licensed. Its [MIT notice](Space-Radar-LICENSE.txt) is included alongside the files and in their GLB metadata. The ILRS schematic contains original geometry and materials.

## Rebuilding

Install the model preparation tools with `npm install --prefix scripts/models`. Run `node scripts/models/moon-prepare.mjs <catalog-id> <source.glb> <output.glb>` on the GLB from each linked model page. The script decodes Draco/meshopt geometry, removes animation and centers the scene for the viewer. For Gateway it also prepares tangent-space geometry and reduces each embedded texture to at most 512 pixels per side. Downloads and conversions happen at build time.

To regenerate ILRS, run `node scripts/models/moon-ilrs.mjs <source.glb>`, then use that source as the input to `moon-prepare.mjs ilrs`.
