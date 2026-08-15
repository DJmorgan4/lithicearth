import laspy, pathlib, sys

src = pathlib.Path("data/lidar/raw")
dst = pathlib.Path("data/lidar/las"); dst.mkdir(parents=True, exist_ok=True)

for f in sorted(src.glob("*.laz")):
    out = dst / (f.stem + ".las")
    if out.exists():
        print("skip", out.name); continue
    with laspy.open(f) as fh:
        las = fh.read()
    las.write(out)
    print(f"{f.name} -> {out.name}  {len(las.points):,} pts")
