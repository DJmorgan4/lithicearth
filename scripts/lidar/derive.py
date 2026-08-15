import numpy as np, rasterio, rvt.vis
from scipy.ndimage import uniform_filter

SRC = "data/lidar/dtm/inomata_test_be.tif"
OUT = "data/lidar/derived"
RES = 0.5
LRM_RADIUS = 20          # cells -> 10 m at 0.5 m

with rasterio.open(SRC) as ds:
    dem = ds.read(1).astype("float64")
    profile = ds.profile.copy()

dem = np.where(dem <= -9998, np.nan, dem)
profile.update(dtype="float32", count=1, nodata=np.nan, compress="deflate")

# --- LRM: DEM minus smoothed DEM, NaN-aware ---
filled = np.nan_to_num(dem, nan=np.nanmean(dem))
mask = (~np.isnan(dem)).astype("float64")
size = LRM_RADIUS * 2 + 1
smooth = uniform_filter(filled, size=size) / np.maximum(
    uniform_filter(mask, size=size), 1e-6)
lrm = np.where(np.isnan(dem), np.nan, dem - smooth)

svf = rvt.vis.sky_view_factor(dem, resolution=RES,
                              compute_svf=True, compute_opns=True,
                              svf_n_dir=16, svf_r_max=10)

layers = {"svf": svf["svf"], "opns": svf["opns"], "lrm": lrm}
for name, arr in layers.items():
    with rasterio.open(f"{OUT}/{name}.tif", "w", **profile) as dst:
        dst.write(np.asarray(arr, dtype="float32"), 1)
    print("wrote", name)
