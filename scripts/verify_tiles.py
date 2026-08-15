"""Decode a z15 tile from the center of Lavon and report depth stats."""
import numpy as np, rasterio

tile = "data/bathy/out/lavon_tiles/15/7603/13190.png"
with rasterio.open(tile) as src:
    r, g, b, a = src.read().astype(np.float64)

meters = (r * 6553.6 + g * 25.6 + b * 0.1) - 10000.0
depth_ft = -meters / 0.3048
water = a > 0

print(f"tile: {tile}")
print(f"water pixels: {water.sum()} / {a.size}")
print(f"depth ft  min: {depth_ft[water].min():.1f}  "
      f"max: {depth_ft[water].max():.1f}  "
      f"mean: {depth_ft[water].mean():.1f}")
print("EXPECT: depths between 0 and ~45 ft, mean somewhere 15-30 for mid-lake")
