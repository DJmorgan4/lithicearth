from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pystac_client import Client
import httpx

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

def sample_cog_point(url: str, lng: float, lat: float):
    try:
        from rio_tiler.io import Reader
        with Reader(url) as r:
            pt = r.point(lng, lat)
            return float(pt.data[0])
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

            ndvi_val = None
            ndvi_method = "unavailable"
            ndvi_asset = None
            b04_val = None
            b08_val = None

            # Try real COG pixel sample first
            b04_asset = item.assets.get("red") or item.assets.get("B04")
            b08_asset = item.assets.get("nir") or item.assets.get("B08")

            if b04_asset and b08_asset:
                b04_href = b04_asset.href if hasattr(b04_asset, 'href') else b04_asset.get('href')
                b08_href = b08_asset.href if hasattr(b08_asset, 'href') else b08_asset.get('href')

                b04_val = sample_cog_point(b04_href, lng, lat)
                b08_val = sample_cog_point(b08_href, lng, lat)

                if b04_val is not None and b08_val is not None and (b08_val + b04_val) != 0:
                    ndvi_val = round((b08_val - b04_val) / (b08_val + b04_val), 4)
                    ndvi_method = "pixel_sample_B08_B04"
                    ndvi_asset = "B08/B04 COG (10m)"

            # Fallback to scene metadata approximation
            if ndvi_val is None:
                veg_pct = props.get("s2:vegetation_percentage")
                if veg_pct is not None:
                    ndvi_val = round(0.1 + (float(veg_pct) / 100) * 0.7, 4)
                    ndvi_method = "scene_metadata_derived"
                    ndvi_asset = "scene_metadata"

            measurements["ndvi"] = {
                "value": ndvi_val,
                "unit": "index",
                "source": "Sentinel-2 L2A",
                "asset": ndvi_asset,
                "acquired": acquired,
                "resolution_m": 10,
                "method": ndvi_method,
                "bands": {"B04_red": b04_val, "B08_nir": b08_val} if b04_val else None,
                "quality": {"cloud_cover_scene_pct": cloud_cover},
                "status": "found"
            }

            measurements["sentinel2_meta"] = {
                "date": acquired,
                "cloud_cover": cloud_cover,
                "thumbnail": item.assets["thumbnail"].href if "thumbnail" in item.assets else None,
                "platform": props.get("platform"),
                "status": "found"
            }
        else:
            measurements["ndvi"] = {"status": "no_results"}
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
            if elev_val is not None and float(elev_val) > -1000000:
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
                raise ValueError("EPQS no data")
        else:
            raise ValueError("outside US bounds")
    except Exception:
        try:
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

    # ── Landsat-9 thermal — real ST_B10 pixel ──
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
            cloud_cover = item.properties.get("eo:cloud_cover")

            temp_celsius = None
            temp_method = "scene_coverage_confirmed"
            raw_val = None

            st_asset = item.assets.get("ST_B10") or item.assets.get("st_b10")
            if st_asset:
                st_href = st_asset.href if hasattr(st_asset, 'href') else st_asset.get('href')
                raw_val = sample_cog_point(st_href, lng, lat)
                if raw_val is not None and raw_val > 0:
                    kelvin = raw_val * 0.00341802 + 149.0
                    temp_celsius = round(kelvin - 273.15, 2)
                    temp_method = "pixel_sample_ST_B10_collection2"

            measurements["thermal"] = {
                "value": temp_celsius,
                "unit": "celsius" if temp_celsius is not None else None,
                "source": "Landsat-9 Collection 2 L2",
                "asset": "ST_B10",
                "acquired": acquired,
                "resolution_m": 30,
                "method": temp_method,
                "platform": item.properties.get("platform"),
                "raw_dn": raw_val,
                "quality": {"cloud_cover_scene_pct": cloud_cover},
                "status": "found"
            }
        else:
            measurements["thermal"] = {"status": "no_results"}
    except Exception as e:
        measurements["thermal"] = {"status": "error", "detail": str(e)}

    # ── Quality assessment — coverage vs pixel measurement ──
    pixel_methods = {
        "point_query",
        "pixel_sample_B08_B04",
        "pixel_sample_ST_B10_collection2",
        "cog_pixel_sample"
    }

    available = 0
    pixel_measured = 0
    measurement_quality_detail = {}

    for key in ["ndvi", "sar", "elevation", "thermal"]:
        m = measurements.get(key, {})
        if not isinstance(m, dict):
            continue
        if m.get("status") == "found":
            available += 1
            method = m.get("method", "")
            res = m.get("resolution_m", "?")
            if method in pixel_methods:
                pixel_measured += 1
                measurement_quality_detail[key] = f"pixel ({res}m)"
            else:
                measurement_quality_detail[key] = f"scene/approx ({res}m)"

    coverage_quality = round(available / 4, 2)
    measurement_quality = round(pixel_measured / 4, 2)
    coverage = "high" if coverage_quality >= 0.75 else "medium" if coverage_quality >= 0.5 else "low"

    # Source trace
    source_trace = []
    if measurements.get("ndvi", {}).get("status") == "found":
        m = measurements["ndvi"]
        source_trace.append(f"Sentinel-2 L2A — NDVI {m.get('value')} ({m.get('method')})")
    if measurements.get("sar", {}).get("status") == "found":
        m = measurements["sar"]
        source_trace.append(f"Sentinel-1 GRD — {m.get('orbit')} orbit · {m.get('acquired','')[:10]}")
    if measurements.get("elevation", {}).get("status") == "found":
        m = measurements["elevation"]
        source_trace.append(f"{m.get('source')} — {m.get('value')}m ({m.get('resolution_m')}m res)")
    if measurements.get("thermal", {}).get("status") == "found":
        m = measurements["thermal"]
        val = f"{m.get('value')}°C" if m.get("value") is not None else "scene confirmed"
        source_trace.append(f"Landsat-9 ST_B10 — {val} ({m.get('method')})")

    pending = [k for k in ["ndvi", "sar", "thermal"] if measurement_quality_detail.get(k, "").startswith("scene")]

    return {
        "location": {"lat": lat, "lng": lng},
        "measurements": measurements,
        "coverage_quality": coverage_quality,
        "measurement_quality": measurement_quality,
        "measurement_quality_detail": measurement_quality_detail,
        "coverage": coverage,
        "source_trace": source_trace,
        "anomaly_score": None,
        "note": f"Pixel-level measurement pending for: {', '.join(pending)}" if pending else "All measurements pixel-confirmed"
    }
