"""Flag band 4 as alpha via rasterio, then rebuild tiles."""
import subprocess, rasterio
from rasterio.enums import ColorInterp

OUT = "data/bathy/out"
with rasterio.open(f"{OUT}/lavon_rgba.tif", "r+") as ds:
    ds.colorinterp = [ColorInterp.red, ColorInterp.green,
                      ColorInterp.blue, ColorInterp.alpha]

subprocess.run(["rm", "-rf", f"{OUT}/lavon_tiles"], check=True)
subprocess.run(["gdal2tiles.py", "--xyz", "-z", "10-16", "-r", "near",
                "--processes=8", f"{OUT}/lavon_rgba.tif", f"{OUT}/lavon_tiles"],
               check=True)
print("DONE")
