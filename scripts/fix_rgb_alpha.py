"""Re-encode Terrain-RGB with alpha so nodata is transparent, re-tile."""
import subprocess, numpy as np, rasterio

OUT = "data/bathy/out"
with rasterio.open(f"{OUT}/lavon_depth_3857.tif") as src:
    prof = src.profile
    prof.update(count=4, dtype="uint8", nodata=None, photometric="RGB")
    with rasterio.open(f"{OUT}/lavon_rgba.tif", "w", **prof) as dst:
        for _, win in src.block_windows(1):
            d = src.read(1, window=win)
            nod = (d == -9999)
            m = np.where(nod, 0.0, -d * 0.3048)
            enc = np.round((m + 10000.0) / 0.1).astype(np.uint32)
            dst.write(((enc >> 16) & 255).astype(np.uint8), 1, window=win)
            dst.write(((enc >> 8) & 255).astype(np.uint8), 2, window=win)
            dst.write((enc & 255).astype(np.uint8), 3, window=win)
            dst.write(np.where(nod, 0, 255).astype(np.uint8), 4, window=win)

subprocess.run(["rm", "-rf", f"{OUT}/lavon_tiles"], check=True)
subprocess.run(["gdal2tiles.py", "--xyz", "-z", "10-16", "-r", "near",
                "--processes=8", f"{OUT}/lavon_rgba.tif", f"{OUT}/lavon_tiles"],
               check=True)
print("DONE")
