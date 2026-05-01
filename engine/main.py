from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pystac_client import Client

app = FastAPI(title="Lithic Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://lithicearth.com"],
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

    # Sentinel-2 optical
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
            results["sentinel2"] = {
                "date": item.datetime.isoformat() if item.datetime else None,
                "cloud_cover": item.properties.get("eo:cloud_cover"),
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

    # Score + insights
    score = 0
    insights = []

    if results.get("sentinel2", {}).get("status") == "found":
        cc = results["sentinel2"].get("cloud_cover", 100)
        if cc < 5:
            score += 2
            insights.append("Excellent optical clarity — cloud cover < 5%")
        elif cc < 20:
            score += 1
            insights.append(f"Good optical conditions — {cc:.0f}% cloud cover")

    if results.get("sentinel1_sar", {}).get("status") == "found":
        score += 3
        insights.append("SAR coverage confirmed — all-weather surface analysis available")
        orbit = results["sentinel1_sar"].get("orbit")
        if orbit:
            insights.append(f"SAR acquisition: {orbit} orbit pass")

    if not insights:
        insights.append("Location queued for analysis — no recent clear imagery found")

    return {
        "location": {"lat": lat, "lng": lng},
        "layers": results,
        "insights": insights,
        "score": score,
        "confidence": round(min(score / 8, 1.0), 2)
    }


@app.get("/health")
def health():
    return {"status": "alive", "engine": "Lithic v1"}
