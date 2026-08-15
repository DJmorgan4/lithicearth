"""Flag band 4 as alpha, then rebuild the tile pyramid."""
import subprocess
from osgeo import gdal

OUT = "data/bathy/out"
ds = gdal.Open(f"{OUT}/lavon_rgba.tif", gdal.GA_Update)
ds.GetRasterBand(4).SetColorInterpretation(gdal.GCI_AlphaBand)
ds = None

subprocess.run(["rm", "-rf", f"{OUT}/lavon_tiles"], check=True)
subprocess.run(["gdal2tiles.py", "--xyz", "-z", "10-16", "-r", "near",
                "--processes=8", f"{OUT}/lavon_rgba.tif", f"{OUT}/lavon_tiles"],
               check=True)
print("DONE")
