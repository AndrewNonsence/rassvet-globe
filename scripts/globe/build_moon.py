"""Prepare self-hosted lunar assets from the NASA SVS and LROC PDS products.

Usage: python scripts/globe/build_moon.py SOURCE_DIRECTORY
Input filenames and credits are recorded in the resulting sources.json.
Requires Pillow and NumPy.
"""

import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path

import numpy as np
from PIL import Image


def prepare(source, output):
    output.mkdir(parents=True, exist_ok=True)
    color = source / "lroc_color_2k.jpg"
    grid = source / "ldem_4_uint.tif"
    dem = source / "NAC_DTM_APOLLO11_E008N0234.IMG"
    photo = source / "NAC_DTM_APOLLO11_M150361817_2M.IMG"
    shutil.copyfile(color, output / "lroc.jpg")
    with Image.open(grid) as raster:
        assert raster.size == (1440, 720)
        meters = np.asarray(raster).astype(np.float64) * 0.5 - 10000
    # Average each 2x2 footprint. North is the first row, 0 E is the central meridian.
    meters = meters.reshape(360, 2, 720, 2).mean(axis=(1, 3))
    np.rint(meters).astype("<i2").tofile(output / "lola.bin")

    # v1.9 PDS3 fixed-length labels, with matching equirectangular projections.
    # Projection offsets are relative to pixel (0,0) in zero-based arrays.
    resolution = 15161.67521207
    x_scale = resolution * math.cos(math.radians(1))
    lon = 23.47314
    lat = 0.67416
    x = round(2374376.5 + (lon - 180) * x_scale)
    y = round(18747.5 - lat * resolution)
    def extract(path, dtype):
        with path.open("rb") as stream:
            label = stream.read(8444).decode("ascii")
        assert "2374376.5" in label and "18747.5" in label and "13978" in label
        image = np.memmap(path, dtype=dtype, mode="r", offset=8444, shape=(13978, 2111))
        return image

    height_image = extract(dem, "<f4")
    local = np.s_[y - 512:y + 513, x - 512:x + 513]
    heights = height_image[local]
    assert np.isfinite(heights).all() and heights.min() > -10000
    # Store decimetres relative to the common lunar reference radius.
    np.rint(heights[::4, ::4] * 10).astype("<i2").tofile(output / "apollo11.bin")
    photo_image = extract(photo, "<i2")
    albedo = photo_image[local].copy()
    # The camera has a narrow intermittent bad-column streak. Fill only
    # null orthophoto pixels from their immediate valid row neighbours.
    for row in albedo:
        valid = row > -32764
        if not valid.all():
            row[~valid] = np.interp(np.flatnonzero(~valid), np.flatnonzero(valid), row[valid])
    low, high = np.percentile(albedo, [0.1, 99.9])
    display = np.clip((albedo - low) / (high - low), 0, 1) * 220 + 12
    Image.fromarray(np.rint(display).astype("uint8")).save(output / "apollo11.jpg", quality=88)
    # A wider measured strip provides the distant ground at shallow angles.
    # Use the same tonal stretch as the inner photo for a seamless boundary.
    context_region = np.s_[y - 3072:y + 3073, 64:2049]
    outer_heights = height_image[context_region][::16, ::16]
    assert outer_heights.shape == (385, 125) and outer_heights.min() > -10000
    np.rint(outer_heights * 10).astype("<i2").tofile(output / "apollo11-area.bin")
    outer_photo = photo_image[context_region][::4, ::4].copy()
    for row in outer_photo:
        valid = row > -32764
        if not valid.all():
            row[~valid] = np.interp(np.flatnonzero(~valid), np.flatnonzero(valid), row[valid])
    area = np.clip((outer_photo - low) / (high - low), 0, 1) * 220 + 12
    Image.fromarray(np.rint(area).astype("uint8")).save(output / "apollo11-area.jpg", quality=85)
    manifest = {
        "global": {"width": 720, "height": 360, "radiusKm": 1737.4,
                   "source": "https://svs.gsfc.nasa.gov/4720/", "credit": "NASA/GSFC/ASU, LRO LOLA Science Team"},
        "apollo11": {"side": 257,
                     "north": (18747.5 - (y - 512)) / resolution,
                     "south": (18747.5 - (y + 512)) / resolution,
                     "west": 180 + (x - 512 - 2374376.5) / x_scale,
                     "east": 180 + (x + 512 - 2374376.5) / x_scale,
                     "source": "https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_APOLLO11",
                     "credit": "NASA/GSFC/Arizona State University", "meshSpacingMeters": 8,
                     "orthoSpacingMeters": 2},
        "apollo11Area": {"width": 125, "height": 385,
                         "north": (18747.5 - (y - 3072)) / resolution,
                         "south": (18747.5 - (y + 3072)) / resolution,
                         "west": 180 + (64 - 2374376.5) / x_scale,
                         "east": 180 + (2048 - 2374376.5) / x_scale,
                         "meshSpacingMeters": 32, "orthoSpacingMeters": 8},
        "sourceSha256": {}
    }
    for path in (color, grid, dem, photo):
        with path.open("rb") as stream:
            manifest["sourceSha256"][path.name] = hashlib.file_digest(stream, "sha256").hexdigest()
    (output / "sources.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path,
                        default=Path(__file__).resolve().parents[2] / "web/static/assets/moon/terrain")
    args = parser.parse_args()
    prepare(args.source, args.output)
