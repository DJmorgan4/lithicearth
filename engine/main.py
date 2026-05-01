from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pystac_client import Client
import httpx

app = FastAPI(title="Lithic Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "alive", "engine": "Lithic v1"}

@app.get("/analyze")
def analyze(lat: float, lng: float):
    results = {}
    catalog = Client.open("https://earth-search.aws.element84.com/v1")

    # Sentinel-2 optical + NDVI approx
    try:
        search = catalog.search(
            collections=["sentinel-2-l2a"],
            intersects={"type": "Point", "coordinates": [lng, lat]},
            query={"eo:cloud_cover": {"lt": 20}},
            max_items=3
        )
        items = list(search.items())
        if items:
            item = items[0]
            props = item.properties
            ndvi_approx = None
            veg = props.get("s2:vegetation_percentage")
            if veg is not None:
                ndvi_approx = round(0.1 + (float(veg) / 100) * 0.7, 3)
            results["sentinel2"] = {
                "date": item.datetime.isoformat() if item.datetime else None,
                "cloud_cover": props.get("eo:cloud_cover"),
                "vegetation_pct": veg,
                "ndvi_approx": ndvi_approx,
                "thumbnail": item.assets["thumbnail"].href if "thumbnail" in item.assets else None,
                "status": "found"
            }
        else:
            results["sentinel2"] = {"status": "no_results"}
    except Exception as e:
        results["sentinel2"] = {"status": "error", "detail": str(e)}

    # Sentinel-1 SAR
    try:
        search = catalog.search(
            collections=["sentinel-1-grd"],
            intersects={"type": "Point", "coordinates": [lng, lat]},
            max_items=3
        )
        items = list(search.items())
        if items:
            item = items[0]
            results["sentinel1_sar"] = {
                "date": item.datetime.isoformat() if item.datetime else None,
                "platform": item.properties.get("platform"),
                "orbit": item.properties.get("sat:orbit_state"),
                "status": "found"
            }
        else:
            results["sentinel1_sar"] = {"status": "no_results"}
    except Exception as e:
        results["sentinel1_sar"] = {"status": "error", "detail": str(e)}

    # Elevation — USGS 3DEP for US, SRTM fallback globally
    try:
        if -125 <= lng <= -66 and 24 <= lat <= 50:
            try:
                results["elevation"] = {
                    "value": round(float(elev_val), 1),
                    "unit": "m",
                    "source": "USGS 3DEP (1m)",
                    "status": "found"
                }
            except Exception:
                pass
        if "elevation" not in results:
            r = httpx.get(f"https://api.open-elevation.com/api/v1/lookup?locations={lat},{lng}", timeout=8)
            elev_data = r.json()
            elevation = elev_data["results"][0]["elevation"]
            results["elevation"] = {"value": elevation, "unit": "m", "source": "SRTM", "status": "found"}
    except Exception:
        results["elevation"] = {"status": "unavailable"}

    # Landsat-9 thermal
    try:
        search = catalog.search(
            collections=["landsat-c2-l2"],
            intersects={"type": "Point", "coordinates": [lng, lat]},
            query={"eo:cloud_cover": {"lt": 30}},
            max_items=3
        )
        items = list(search.items())
        if items:
            item = items[0]
            results["landsat_thermal"] = {
                "date": item.datetime.isoformat() if item.datetime else None,
                "platform": item.properties.get("platform"),
                "status": "found"
            }
        else:
            results["landsat_thermal"] = {"status": "no_results"}
    except Exception as e:
        results["landsat_thermal"] = {"status": "error", "detail": str(e)}

    # Intelligence scoring + interpretation
    score = 0
    insights = []
    interpretation = []

    s2 = results.get("sentinel2", {})
    sar = results.get("sentinel1_sar", {})
    elev = results.get("elevation", {})
    thermal = results.get("landsat_thermal", {})

    if s2.get("status") == "found":
        cc = s2.get("cloud_cover", 100)
        if cc < 5:
            score += 2
            insights.append(f"Excellent optical clarity — cloud cover < 5%")
        elif cc < 20:
            score += 1
            insights.append(f"Good optical conditions — {cc:.0f}% cloud cover")
        ndvi = s2.get("ndvi_approx")
        if ndvi is not None:
            score += 1
            if ndvi < 0.2:
                insights.append(f"Low vegetation index ({ndvi}) — possible bare soil, urban, or disturbed surface")
                interpretation.append("Low vegetation signal detected")
            elif ndvi < 0.5:
                insights.append(f"Moderate vegetation index ({ndvi}) — mixed land cover")
            else:
                insights.append(f"High vegetation index ({ndvi}) — dense vegetation present")

    if sar.get("status") == "found":
        score += 3
        insights.append("SAR coverage confirmed — all-weather surface analysis available")
        orbit = sar.get("orbit")
        if orbit:
            insights.append(f"SAR acquisition: {orbit} orbit pass")

    if elev.get("status") == "found":
        score += 1
        elev_val = elev.get("value", 0)
        source = elev.get("source", "")
        insights.append(f"Elevation {elev_val}m ({source})")
        if elev_val < 0:
            interpretation.append("Below sea level — coastal or below-grade location")
        elif elev_val < 10:
            interpretation.append("Near sea level — flood risk zone possible")
        elif elev_val > 2000:
            interpretation.append("High altitude terrain — mountainous zone")

    if thermal.get("status") == "found":
        score += 1
        insights.append("Landsat-9 thermal coverage available")

    anomaly_flags = len(interpretation)
    if anomaly_flags >= 2:
        summary = "Multiple anomalous signals detected — recommend field verification"
    elif anomaly_flags == 1:
        summary = interpretation[0]
    elif score >= 6:
        summary = "Normal surface conditions — no anomalies flagged"
    else:
        summary = "Partial coverage — additional data acquisition recommended"

    return {
        "location": {"lat": lat, "lng": lng},
        "layers": results,
        "insights": insights,
        "interpretation": interpretation,
        "summary": summary,
        "score": score,
        "confidence": round(min(score / 8, 1.0), 2)
    }
