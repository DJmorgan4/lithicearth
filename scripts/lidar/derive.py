import numpy as np, rvt.default, rvt.vis

SRC = "data/lidar/dtm/inomata_test_be.tif"
OUT = "data/lidar/derived"
RES = 0.5

dem = rvt.default.get_raster_arr(SRC)["array"]
if dem.ndim == 3:
    dem = dem[0]
dem = np.where(dem <= -9998, np.nan, dem).astype("float32")

svf = rvt.vis.sky_view_factor(dem, resolution=RES,
                              compute_svf=True, compute_opns=True,
                              svf_n_dir=16, svf_r_max=10)
lrm = rvt.vis.local_relief_model(dem, radius_cell=20)

for name, arr in [("svf", svf["svf"]), ("opns", svf["opns"]), ("lrm", lrm)]:
    rvt.default.save_raster(src_raster_path=SRC,
                            out_raster_path=f"{OUT}/{name}.tif",
                            out_raster_arr=np.asarray(arr, dtype="float32"))
    print("wrote", name)
