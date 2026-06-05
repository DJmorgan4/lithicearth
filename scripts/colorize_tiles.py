"""Bake the depth color ramp into RGBA tiles for Leaflet."""
import subprocess, numpy as np, rasterio

OUT = "data/bathy/out"
# ramp in feet (converted from the -14..0 m Mapbox ramp)
stops_ft = [0, 6.6, 16.4, 29.5, 45.9]
cols = ["#bfeee6", "#3fb3a5", "#19708c", "#0c3a5e", "#04122b"]
rgb = np.array([[int(c[i:i+2], 16) for i in (1, 3, 5)] for c in cols], float)

with rasterio.open(f"{OUT}/lavon_depth_3857.tif") as src:
    prof = src.profile
    prof.update(count=4, dtype="uint8", nodata=None, photometric="RGB")
    with rasterio.open(f"{OUT}/lavon_color.tif", "w", **prof) as dst:
        for _, win in src.block_windows(1):
            d = src.read(1, window=win)
            nod = (d == -9999)
            dep = np.clip(np.where(nod, 0, d), 0, 45.9)
            for b in range(3):
                band = np.interp(dep, stops_ft, rgb[:, b]).astype(np.uint8)
                dst.write(band, b + 1, window=win)
            dst.write(np.where(nod, 0, 255).astype(np.uint8), 4, window=win)

from rasterio.enums import ColorInterp
with rasterio.open(f"{OUT}/lavon_color.tif", "r+") as ds:
    ds.colorinterp = [ColorInterp.red, ColorInterp.green,
                      ColorInterp.blue, ColorInterp.alpha]

subprocess.run(["rm", "-rf", "website/public/bathy/lavon_color_tiles"], check=True)
subprocess.run(["gdal2tiles.py", "--xyz", "-z", "10-16", "-r", "near",
                "--processes=8", f"{OUT}/lavon_color.tif",
                "website/public/bathy/lavon_color_tiles"], check=True)
# kill gdal2tiles junk immediately this time
subprocess.run(["rm", "-f"] + [f"website/public/bathy/lavon_color_tiles/{f}"
    for f in ["leaflet.html", "openlayers.html", "mapml.mapml", "stacta.json"]])
print("DONE")
