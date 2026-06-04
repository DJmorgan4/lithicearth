#!/usr/bin/env python3
"""TWDB bathy grid -> depth GeoTIFF, contours, Terrain-RGB XYZ tiles."""
import subprocess, numpy as np, rasterio

POOL = 492.0  # Lavon conservation pool, ft NGVD29
SRC = "data/bathy/raw/lavon_rasters/trs2lav21vi"
OUT = "data/bathy/out"

def run(cmd):
    print("+", " ".join(cmd)); subprocess.run(cmd, check=True)

# 1. Depth in feet = pool - elevation, floor at 0
run(["gdal_calc.py", "-A", SRC, "--outfile", f"{OUT}/lavon_depth.tif",
     "--calc", f"maximum({POOL}-A,0)", "--type", "Float32",
     "--NoDataValue", "-9999", "--co", "COMPRESS=DEFLATE", "--co", "TILED=YES"])

# 2. Contours every 2 ft, reprojected to WGS84 for Mapbox
run(["gdal_contour", "-a", "depth_ft", "-i", "2",
     f"{OUT}/lavon_depth.tif", f"{OUT}/lavon_contours_2276.geojson", "-f", "GeoJSON"])
run(["ogr2ogr", "-t_srs", "EPSG:4326",
     f"{OUT}/lavon_contours.geojson", f"{OUT}/lavon_contours_2276.geojson"])

# 3. Warp depth to web mercator at ~1 m
run(["gdalwarp", "-t_srs", "EPSG:3857", "-tr", "1", "1", "-r", "bilinear",
     "-co", "COMPRESS=DEFLATE", "-co", "TILED=YES",
     f"{OUT}/lavon_depth.tif", f"{OUT}/lavon_depth_3857.tif"])

# 4. Terrain-RGB encode (meters, lakebed below 0), windowed to keep RAM sane
with rasterio.open(f"{OUT}/lavon_depth_3857.tif") as src:
    prof = src.profile
    prof.update(count=3, dtype="uint8", nodata=None, photometric="RGB")
    with rasterio.open(f"{OUT}/lavon_rgb.tif", "w", **prof) as dst:
        for _, win in src.block_windows(1):
            d = src.read(1, window=win)
            m = np.where(d == -9999, 0.0, -d * 0.3048)  # ft -> m, negate
            enc = np.round((m + 10000.0) / 0.1).astype(np.uint32)
            dst.write(((enc >> 16) & 255).astype(np.uint8), 1, window=win)
            dst.write(((enc >> 8) & 255).astype(np.uint8), 2, window=win)
            dst.write((enc & 255).astype(np.uint8), 3, window=win)

# 5. XYZ tile pyramid
run(["gdal2tiles.py", "--xyz", "-z", "10-16", "-r", "near", "--processes=8",
     f"{OUT}/lavon_rgb.tif", f"{OUT}/lavon_tiles"])
print("DONE")

