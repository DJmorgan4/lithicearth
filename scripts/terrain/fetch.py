#!/usr/bin/env python3
"""Any US AOI -> 1m DEM + renders.  fetch.py W S E N name"""
import sys, json, subprocess, urllib.parse, urllib.request, pathlib
import numpy as np, rasterio

W,S,E,N,NAME = float(sys.argv[1]),float(sys.argv[2]),float(sys.argv[3]),float(sys.argv[4]),sys.argv[5]
RAW=pathlib.Path("data/tx/raw"); DTM=pathlib.Path("data/tx/dtm"); DER=pathlib.Path("data/tx/derived")
for d in (RAW,DTM,DER): d.mkdir(parents=True, exist_ok=True)

q = urllib.parse.urlencode({"datasets":"Digital Elevation Model (DEM) 1 meter",
    "bbox":f"{W},{S},{E},{N}","outputFormat":"JSON","max":50})
items = json.load(urllib.request.urlopen(f"https://tnmaccess.nationalmap.gov/api/v1/products?{q}"))["items"]
if not items: sys.exit("No 1m coverage. Try 10m seamless.")

seen=set(); paths=[]
for it in items:
    u=it["downloadURL"]; f=RAW/u.split("/")[-1]
    if u in seen: continue
    seen.add(u)
    if not f.exists():
        print("fetch", f.name); urllib.request.urlretrieve(u, f)
    paths.append(str(f))

vrt=str(DTM/f"{NAME}.vrt"); dem=str(DTM/f"{NAME}_1m.tif")
subprocess.run(["gdalbuildvrt",vrt]+paths,check=True)
subprocess.run(["gdal_translate","-projwin_srs","EPSG:4326","-projwin",str(W),str(N),str(E),str(S),
                "-co","COMPRESS=DEFLATE","-co","TILED=YES",vrt,dem],check=True)

with rasterio.open(dem) as ds:
    a=ds.read(1,out_shape=(1,1000,1000)).astype("float64"); nd=ds.nodata
a=a[np.isfinite(a)];  a=a[a!=nd] if nd is not None else a
brk=np.percentile(a,[1,15,35,50,65,80,92,99])
pal=[(8,48,107),(33,113,181),(107,174,214),(199,233,180),(254,224,139),(253,174,97),(227,74,51),(120,20,20)]
ramp=str(DER/f"{NAME}_ramp.txt")
with open(ramp,"w") as f:
    for v,(r,g,b) in zip(brk,pal): f.write(f"{v:.2f} {r} {g} {b}\n")
    f.write("nv 0 0 0 0\n")
z=max(0.5,min(8.0,40.0/max(np.ptp(brk),1)))
subprocess.run(["gdaldem","color-relief",dem,ramp,str(DER/f"{NAME}_color.tif"),"-alpha","-co","COMPRESS=DEFLATE","-co","TILED=YES"],check=True)
subprocess.run(["gdaldem","hillshade",dem,str(DER/f"{NAME}_hs.tif"),"-multidirectional","-z",str(z),"-co","COMPRESS=DEFLATE","-co","TILED=YES"],check=True)
subprocess.run(["gdaldem","slope",dem,str(DER/f"{NAME}_slope.tif"),"-p","-co","COMPRESS=DEFLATE","-co","TILED=YES"],check=True)
print(f"\ndone: {NAME}  z={z:.2f}  range={brk[0]:.0f}-{brk[-1]:.0f}m")
