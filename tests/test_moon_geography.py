"""Geographic checks for the Apollo 11 terrain, using independent LROC observations."""

import json
import math
from pathlib import Path
import struct
import unittest


ROOT = Path(__file__).resolve().parents[1]
TERRAIN = ROOT / "web/static/assets/moon/terrain"
if not TERRAIN.exists():
    TERRAIN = ROOT / "assets/moon/terrain"


class ApolloTerrain(unittest.TestCase):
    def test_eagle_and_west_crater(self):
        # Eagle coordinates and elevation: LROC Coordinates of Lunar Anthropogenic Targets (2016).
        # West is ~180 m across, ~500 m east of Eagle: lroc.im-ldi.com/visit/exhibits/1/gallery/8.
        site = json.loads((TERRAIN / "sources.json").read_text(encoding="utf-8"))["apollo11"]
        side = site["side"]
        heights = struct.unpack(f"<{side * side}h", (TERRAIN / "apollo11.bin").read_bytes())
        x = round((23.47314 - site["west"]) / (site["east"] - site["west"]) * (side - 1))
        y = round((site["north"] - 0.67416) / (site["north"] - site["south"]) * (side - 1))
        self.assertTrue(0 <= x < side and 0 <= y < side)
        self.assertAlmostEqual(heights[y * side + x] / 10, -1926, delta=3)

        spacing = site["meshSpacingMeters"]
        candidates = (
            (heights[row * side + col], col, row)
            for row in range(side) for col in range(side)
            if 400 <= (col - x) * spacing <= 650 and abs(row - y) * spacing <= 150
        )
        floor, col, row = min(candidates)
        self.assertAlmostEqual(math.hypot(col - x, row - y) * spacing, 500, delta=100)
        # Along this east-west transect both walls of the crater rise above its floor.
        radius = round(90 / spacing)
        for rim in (col - radius, col + radius):
            self.assertGreater((heights[row * side + rim] - floor) / 10, 18)


if __name__ == "__main__":
    unittest.main()
