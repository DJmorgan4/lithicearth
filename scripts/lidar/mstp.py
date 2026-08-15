import numpy as np, rasterio, rvt.vis

SRC = "data/lidar/dtm/inomata_test_be.tif"
OUT = "data/lidar/derived/mstp.tif"

with rasterio.open(SRC) as ds:
    dem = ds.read(1).astype("float64")
    profile = ds.profile.copy()
dem = np.where(dem <= -9998, np.nan, dem)

rgb = rvt.vis.mstp(dem,
                   local_scale=(1, 10, 1),      # 0.5–5 m
                   meso_scale=(10, 100, 5),     # 5–50 m
                   broad_scale=(100, 1000, 50), # 50–500 m
                   lightness=1.2)

arr = np.clip(np.nan_to_num(rgb, nan=0.0) * 255, 0, 255).astype("uint8")
if arr.shape[0] != 3:
    arr = np.moveaxis(arr, -1, 0)

profile.update(dtype="uint8", count=3, nodata=None, compress="deflate", photometric="rgb")
with rasterio.open(OUT, "w", **profile) as dst:
    dst.write(arr)
print("wrote", OUT, arr.shape)
