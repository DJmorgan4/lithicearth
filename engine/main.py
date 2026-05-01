from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pystac_client import Client
import httpx
import numpy as np

app = FastAPI(title="Lithic Engine", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "alive", "engine": "Lithic v2 — real pixel measurements"}

def sample_cog_pixel(url: str, lat: float, lng: float) -> float | None:
    """Sample a single pixel value from a Cloud Optimized GeoTIFF at lat/lng."""
    try:
        from rio_tiler.io import Reader
        with Reader(url) as cog:
            img = cog.point(lng, lat)
            return float(img.data[0])
    except Exception:
        return None

@app.get("/analyze")
def analyze(lat: float, lng: float):
    measurements = {}
    catalog = Client.open("https://earth-search.aws.element84.com/v1")

    # ── Sentinel-2 L2A — real NDVI from B04/B08 COG pixels ──
    try:
        search = catalog.search(
            collections=["sentinel-2-l2a"],
            intersects={"type": "Point", "coordinates": [lng, lat]},
            query={"eo:cloud_cover": {"lt": 20}},
            max_items=5
        )
        items = list(search.items())
        if items:
            item = items[0]
            props = item.properties
            acquired = item.datetime.isoformat() if item.datetime else None
            cloud_cover = props.get("eo:cloud_cover")

            # Get COG URLs for B04 (red) and B08 (NIR)
            b04_url = item.assets.get("red", item.assets.get("B04", None))
            b08_url = item.assets.get("nir", item.assets.get("B08", None))

            ndvi_val = None
            ndvi_method = "scene_metadata_approx"

            if b04_url and b08_url:
                b04_href = b04_url.href if hasattr(b04_url, 'href') else b04_url.get('href')
                b08_href = b08_url.href if hasattr(b08_url, 'href') else b08_url.get('href')

                b04 = sample_cog_pixel(b04_href, lat, lng)
                b08 = sample_cog_pixel(b08_href, lat, lng)

                if b04 is not None and b08 is not None and (b08 + b04) != 0:
                    ndvi_val = round((b08 - b04) / (b08 + b04), 4)
                    ndvi_method = "pixel_sample_B08_B04"

            # Fallback to vegetation percentage approximation
            if ndvi_val is None:
                veg_pct = props.get("s2:vegetation_percentage")
                if veg_pct is not None:
                    ndvi_val = round(0.1 + (float(veg_pct) / 100) * 0.7, 4)
                    ndvi_method = "scene_vegetation_pct_approx"

            measurements["ndvi"] = {
                "value": ndvi_val,
                "unit": "index",
                "source": "Sentinel-2 L2A",
                "asset": "B08/B04 COG",
                "acquired": acquired,
                "resolution_m": 10,
                "method": ndvi_method,
                "quality": {
                    "cloud_cover_scene_pct": cloud_cover,
                },
                "status": "found"
            }

            measurements["sentinel2_meta"] = {
                "date": acquired,
                "cloud_cover": cloud_cover,
                "thumbnail": item.assets["thumbnail"].href if "thumbnail" in item.assets else None,
                "platform": props.get("platform"),
                "status": "found"
            }
    except Exception as e:
        measurements["ndvi"] = {"status": "error", "detail": str(e)}

    # ── Sentinel-1 SAR ──
    try:
        search = catalog.search(
            collections=["sentinel-1-grd"],
            intersects={"type": "Point", "coordinates": [lng, lat]},
            max_items=3
        )
        items = list(search.items())
        if items:
            item = items[0]
            measurements["sar"] = {
                "value": None,
                "unit": "dB",
                "source": "Sentinel-1 GRD",
                "asset": "VV polarization",
                "acquired": item.datetime.isoformat() if item.datetime else None,
                "resolution_m": 10,
                "method": "scene_coverage_confirmed",
                "platform": item.properties.get("platform"),
                "orbit": item.properties.get("sat:orbit_state"),
                "status": "found"
            }
        else:
            measurements["sar"] = {"status": "no_results"}
    except Exception as e:
        measurements["sar"] = {"status": "error", "detail": str(e)}

    # ── Elevation — USGS EPQS for US, SRTM globally ──
    try:
        if -125 <= lng <= -66 and 24 <= lat <= 50:
            r = httpx.get(
                f"https://epqs.nationalmap.gov/v1/json?x={lng}&y={lat}&wkid=4326&units=Meters&includeDate=false",
                timeout=8
            )
            data = r.json()
            elev_val = data.get("value")
            if elev_val is not None and elev_val != -1000000:
                measurements["elevation"] = {
                    "value": round(float(elev_val), 2),
                    "unit": "m",
                    "source": "USGS 3DEP / National Map EPQS",
                    "asset": "National Elevation Dataset",
                    "resolution_m": 1,
                    "method": "point_query",
                    "status": "found"
                }
            else:
                raise ValueError("EPQS returned no data")
        else:
            r = httpx.get(
                f"https://api.open-elevation.com/api/v1/lookup?locations={lat},{lng}",
                timeout=8
            )
            elev_data = r.json()
            elevation = elev_data["results"][0]["elevation"]
            measurements["elevation"] = {
                "value": round(float(elevation), 1),
                "unit": "m",
                "source": "SRTM v3",
                "asset": "open-elevation.com",
                "resolution_m": 90,
                "method": "point_query",
                "status": "found"
            }
    except Exception:
        measurements["elevation"] = {"status": "unavailable"}

    # ── Landsat-9 thermal — real surface temperature ──
    try:
        search = catalog.search(
            collections=["landsat-c2-l2"],
            intersects={"type": "Point", "coordinates": [lng, lat]},
            query={"eo:cloud_cover": {"lt": 30}},
            max_items=5
        )
        items = list(search.items())
        if items:
            item = items[0]
            acquired = item.datetime.isoformat() if item.datetime else None

            # Try to read ST_B10 surface temperature COG
            st_asset = item.assets.get("ST_B10") or item.assets.get("st_b10")
            temp_celsius = None
            temp_method = "scene_coverage_confirmed"

            if st_asset:
                st_href = st_asset.href if hasattr(st_asset, 'href') else st_asset.get('href')
                raw_val = sample_cog_pixel(st_href, lat, lng)
                if raw_val is not None and raw_val > 0:
                    # USGS Collection 2 ST scale: multiply by 0.00341802, add 149.0 = Kelvin
                    kelvin = raw_val * 0.00341802 + 149.0
                    temp_celsius = round(kelvin - 273.15, 2)
                    temp_method = "pixel_sample_ST_B10_collection2"

            measurements["thermal"] = {
                "value": temp_celsius,
                "unit": "celsius" if temp_celsius is not None else None,
                "source": "Landsat-9 Collection 2 L2",
                "asset": "ST_B10 surface temperature",
                "acquired": acquired,
                "resolution_m": 30,
                "method": temp_method,
                "platform": item.properties.get("platform"),
                "quality": {
                    "cloud_cover_scene_pct": item.properties.get("eo:cloud_cover")
                },
                "status": "found"
            }
        else:
            measurements["thermal"] = {"status": "no_results"}
    except Exception as e:
        measurements["thermal"] = {"status": "error", "detail": str(e)}

    # ── Data quality assessment ──
    found = [k for k, v in measurements.items() if isinstance(v, dict) and v.get("status") == "found"]
    total_possible = 4  # ndvi, sar, elevation, thermal
    data_quality = round(len([k for k in ["ndvi", "sar", "elevation", "thermal"] if measurements.get(k, {}).get("status") == "found"]) / total_possible, 2)

    coverage = "high" if data_quality >= 0.75 else "medium" if data_quality >= 0.5 else "low"

    # Build source trace
    source_trace = []
    if measurements.get("ndvi", {}).get("status") == "found":
        source_trace.append(f"Sentinel-2 L2A ({measurements['ndvi']['method']})")
    if measurements.get("sar", {}).get("status") == "found":
        source_trace.append(f"Sentinel-1 GRD ({measurements['sar'].get('orbit', '')} orbit)")
    if measurements.get("elevation", {}).get("status") == "found":
        source_trace.append(f"{measurements['elevation']['source']} ({measurements['elevation']['resolution_m']}m res)")
    if measurements.get("thermal", {}).get("status") == "found":
        method = measurements["thermal"]["method"]
        val = measurements["thermal"]["value"]
        if val is not None:
            source_trace.append(f"Landsat-9 ST_B10 → {val}°C")
        else:
            source_trace.append("Landsat-9 ST_B10 (scene confirmed)")

    return {
        "location": {"lat": lat, "lng": lng},
        "measurements": measurements,
        "data_quality": data_quality,
        "coverage": coverage,
        "source_trace": source_trace,
        "anomaly_score": None,
        "note": "Measurements only — anomaly scoring pending pixel-level QA"
    }
