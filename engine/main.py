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

def sample_ndvi_pixel(lng: float, lat: float, b04_url: str, b08_url: str):
    from rio_tiler.io import Reader
    with Reader(b04_url) as red_reader:
        red = float(red_reader.point(lng, lat).data[0])
    with Reader(b08_url) as nir_reader:
        nir = float(nir_reader.point(lng, lat).data[0])
    if red + nir == 0:
        return None, red, nir
    return round((nir - red) / (nir + red), 4), red, nir
def safe_json(r):
    """Returns (data, error_reason) — never raises."""
    if r.status_code != 200:
        return None, f"http_{r.status_code}"
    if not r.text.strip():
        return None, "empty_response"
    try:
        return r.json(), None
    except Exception:
        return None, "invalid_json"



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


# ── /hydro — NHD streams + NWIS wells within radius ──────────────────
@app.get("/hydro")
def hydro(lat: float, lng: float, radius_km: float = 5.0):
    import math
    results = {"streams": [], "wells": [], "water_bodies": [], "status": "ok"}

    # Bounding box from radius
    deg = radius_km / 111.0
    bbox = f"{lng - deg},{lat - deg},{lng + deg},{lat + deg}"

    # ── NHD streams via USGS WFS ──
    try:
        r = httpx.get(
            "https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6/query",
            params={
                "geometry": f"{lng - deg},{lat - deg},{lng + deg},{lat + deg}",
                "geometryType": "esriGeometryEnvelope",
                "spatialRel": "esriSpatialRelIntersects",
                "outFields": "GNIS_NAME,LENGTHKM,FTYPE,REACHCODE",
                "returnGeometry": "true",
                "f": "json",
                "resultRecordCount": 20,
            },
            timeout=10
        )
        data = r.json()
        for feat in data.get("features", []):
            props = feat.get("attributes", {})
            name = props.get("GNIS_NAME") or "Unnamed"
            ftype = props.get("FTYPE", "")
            length = props.get("LENGTHKM", 0)
            # Approximate distance from center
            geom = feat.get("geometry", {})
            paths = geom.get("paths", [[]])
            if paths:
                px, py = paths[0][0][0], paths[0][0][1]
                dist = math.sqrt((px - lng) ** 2 + (py - lat) ** 2) * 111.0
            else:
                dist = None
            results["streams"].append({
                "name": name,
                "type": ftype,
                "length_km": round(length, 3) if length else None,
                "distance_km": round(dist, 3) if dist else None,
            })
    except Exception as e:
        results["streams_error"] = str(e)

    # ── NWIS groundwater wells ──
    try:
        r = httpx.get(
            "https://waterservices.usgs.gov/nwis/site/",
            params={
                "format": "rdb",
                "bBox": bbox,
                "siteType": "GW",
                "hasDataTypeCd": "gw",
                "siteStatus": "all",
            },
            timeout=10
        )
        lines = [l for l in r.text.split("\n") if l and not l.startswith("#") and not l.startswith("5s")]
        if len(lines) > 1:
            headers = lines[0].split("\t")
            for row in lines[2:20]:
                cols = row.split("\t")
                if len(cols) >= len(headers):
                    d = dict(zip(headers, cols))
                    try:
                        wlat = float(d.get("dec_lat_va", 0))
                        wlng = float(d.get("dec_long_va", 0))
                        dist = math.sqrt((wlng - lng) ** 2 + (wlat - lat) ** 2) * 111.0
                    except:
                        dist = None
                    results["wells"].append({
                        "site_no": d.get("site_no", ""),
                        "name": d.get("station_nm", ""),
                        "depth_ft": d.get("well_depth_va", None),
                        "aquifer": d.get("aqfr_cd", None),
                        "distance_km": round(dist, 3) if dist else None,
                    })
    except Exception as e:
        results["wells_error"] = str(e)

    results["radius_km"] = radius_km
    results["location"] = {"lat": lat, "lng": lng}
    return results


# ── /aquifer — TWDB + EPA sole source aquifer lookup ─────────────────
@app.get("/aquifer")
def aquifer(lat: float, lng: float):
    results = {"major_aquifer": None, "minor_aquifer": None, "sole_source": None, "vulnerability": None}

    # USGS NWIS — aquifer codes from nearby groundwater wells (reliable, no DNS issues)
    try:
        deg = 0.5
        r = httpx.get(
            "https://waterservices.usgs.gov/nwis/site/",
            params={
                "format": "rdb",
                "bBox": f"{lng-deg},{lat-deg},{lng+deg},{lat+deg}",
                "siteType": "GW",
                "hasDataTypeCd": "gw",
                "siteStatus": "all",
            },
            timeout=10
        )
        data, err = safe_json(r)
        if err:
            # rdb format — parse text directly
            lines = [l for l in r.text.split("\n") if l and not l.startswith("#") and not l.startswith("5s")]
            aquifer_codes = set()
            aquifer_names = set()
            if len(lines) > 1:
                headers = lines[0].split("\t")
                for row in lines[2:15]:
                    cols = row.split("\t")
                    if len(cols) >= len(headers):
                        d = dict(zip(headers, cols))
                        aq = d.get("aqfr_cd", "").strip()
                        if aq:
                            aquifer_codes.add(aq)
            if aquifer_codes:
                results["major_aquifer"] = {
                    "name": f"USGS aquifer code(s): {', '.join(aquifer_codes)}",
                    "status": "found",
                    "source": "USGS NWIS well records (0.5° radius)",
                    "note": "Derived from nearby groundwater monitoring wells"
                }
            else:
                results["major_aquifer"] = {"value": None, "status": "no_data", "reason": "no_wells_in_radius"}
        else:
            lines = [l for l in r.text.split("\n") if l and not l.startswith("#") and not l.startswith("5s")]
            aquifer_codes = set()
            if len(lines) > 1:
                headers = lines[0].split("\t")
                for row in lines[2:15]:
                    cols = row.split("\t")
                    if len(cols) >= len(headers):
                        d = dict(zip(headers, cols))
                        aq = d.get("aqfr_cd", "").strip()
                        if aq:
                            aquifer_codes.add(aq)
            if aquifer_codes:
                results["major_aquifer"] = {
                    "name": f"USGS aquifer code(s): {', '.join(aquifer_codes)}",
                    "status": "found",
                    "source": "USGS NWIS well records (0.5° radius)",
                }
            else:
                results["major_aquifer"] = {"value": None, "status": "no_data", "reason": "no_wells_with_aquifer_code"}
    except Exception as e:
        results["major_aquifer"] = {"value": None, "status": "error", "reason": str(e)}

    # TWDB minor aquifers
    try:
        r = httpx.get(
            "https://maps.twdb.texas.gov/arcgis/rest/services/Groundwater/MinorAquifers/MapServer/0/query",
            params={
                "geometry": f"{lng},{lat}",
                "geometryType": "esriGeometryPoint",
                "spatialRel": "esriSpatialRelIntersects",
                "outFields": "AQ_NAME,AQ_CODE",
                "returnGeometry": "false",
                "f": "json",
            },
            timeout=10
        )
        data, err = safe_json(r)
        if err:
            results["minor_aquifer"] = {"value": None, "status": "error", "reason": f"twdb_minor_{err}"}
            data = {}
        feats = (data or {}).get("features", [])
        if feats:
            props = feats[0].get("attributes", {})
            results["minor_aquifer"] = {
                "name": props.get("AQ_NAME"),
                "code": props.get("AQ_CODE"),
                "status": "found",
                "source": "TWDB Minor Aquifers",
            }
    except Exception as e:
        results["minor_aquifer"] = {"value": None, "status": "error", "reason": str(e)}

    # EPA Sole Source Aquifers
    try:
        r = httpx.get(
            "https://gispub.epa.gov/arcgis/rest/services/OW/OW_DRINKING_WATER/MapServer/4/query",
            params={
                "geometry": f"{lng},{lat}",
                "geometryType": "esriGeometryPoint",
                "spatialRel": "esriSpatialRelIntersects",
                "outFields": "SSA_NAME,STATE",
                "returnGeometry": "false",
                "f": "json",
            },
            timeout=10
        )
        data = r.json()
        feats = data.get("features", [])
        if feats:
            props = feats[0].get("attributes", {})
            results["sole_source"] = {
                "name": props.get("SSA_NAME"),
                "state": props.get("STATE"),
                "source": "EPA Sole Source Aquifer Program",
                "rec_flag": True,
            }
    except Exception as e:
        results["sole_source_error"] = str(e)

    # ── Inference layer — derive groundwater likelihood from soils + NDVI ──
    if results.get("major_aquifer", {}).get("status") in (None, "no_data", "error"):
        try:
            # Pull soils for inference
            soils_q = f"SELECT c.drainagecl, c.hydgrp FROM mapunit mu JOIN component c ON mu.mukey=c.mukey WHERE mu.mukey IN (SELECT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point({lng} {lat})')) AND c.majcompflag='Yes'"
            sr = httpx.post(
                "https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest",
                json={"query": soils_q, "format": "JSON"},
                timeout=10
            )
            sd, serr = safe_json(sr)
            soil_rows = (sd or {}).get("Table", []) if not serr else []
            drainage = soil_rows[0][0] if soil_rows else None
            hydro_group = soil_rows[0][1] if soil_rows else None
        except:
            drainage = None
            hydro_group = None

        likelihood = 0
        basis = []

        # Drainage class D or C = poor drainage = groundwater near surface
        if drainage in ["Poorly drained", "Very poorly drained", "Somewhat poorly drained"]:
            likelihood += 1
            basis.append(f"Soil drainage class: {drainage}")

        # Hydrologic group C or D = high runoff potential
        if hydro_group in ["C", "D", "C/D", "D/D"]:
            likelihood += 1
            basis.append(f"Hydrologic group {hydro_group} — low infiltration")

        # Get NDVI from STAC for inference
        try:
            catalog = Client.open("https://earth-search.aws.element84.com/v1")
            search = catalog.search(
                collections=["sentinel-2-l2a"],
                intersects={"type": "Point", "coordinates": [lng, lat]},
                query={"eo:cloud_cover": {"lt": 25}},
                max_items=3
            )
            items = list(search.items())
            if items:
                veg_pct = items[0].properties.get("s2:vegetation_percentage")
                if veg_pct and float(veg_pct) > 40:
                    likelihood += 1
                    basis.append(f"Vegetation cover {round(float(veg_pct),1)}% — indicates soil moisture")
        except:
            pass

        # Elevation depression check
        try:
            er = httpx.get(
                f"https://epqs.nationalmap.gov/v1/json?x={lng}&y={lat}&wkid=4326&units=Meters&includeDate=false",
                timeout=6
            )
            ev, eerr = safe_json(er)
            if not eerr and ev:
                elev_center = float(ev.get("value", 0))
                if elev_center < 170:  # Low elevation in North TX = floodplain proximity
                    likelihood += 1
                    basis.append(f"Low elevation {round(elev_center,1)}m — floodplain zone likely")
        except:
            pass

        if likelihood >= 2:
            results["major_aquifer"] = {
                "name": "Inferred shallow groundwater zone",
                "status": "inferred",
                "confidence": round(likelihood / 4, 2),
                "basis": basis,
                "source": "Multi-source inference (SSURGO + NDVI + DEM)",
                "note": "No direct aquifer mapping available — inferred from environmental indicators"
            }
        elif likelihood == 1:
            results["major_aquifer"] = {
                "name": "Possible groundwater zone",
                "status": "inferred_low",
                "confidence": 0.25,
                "basis": basis,
                "source": "Multi-source inference",
            }

    # Vulnerability score
    vuln = "unknown"
    major = results.get("major_aquifer") or {}
    if results.get("sole_source"):
        vuln = "high"
    elif isinstance(major, dict) and major.get("status") in ("found", "inferred"):
        vuln = "moderate"
    elif isinstance(results.get("minor_aquifer"), dict) and results["minor_aquifer"].get("status") == "found":
        vuln = "low-moderate"
    results["vulnerability"] = vuln
    results["location"] = {"lat": lat, "lng": lng}
    return results


# ── /soils — SSURGO via SDMDataAccess ────────────────────────────────
@app.get("/soils")
def soils(lat: float, lng: float):
    results = {"series": None, "drainage": None, "ksat": None, "depth_to_water": None, "hydro_group": None}

    try:
        # SDM spatial query — get map unit key
        query = f"SELECT mu.muname, c.compname, c.comppct_r, c.drainagecl, c.hydgrp FROM mapunit mu JOIN component c ON mu.mukey=c.mukey WHERE mu.mukey IN (SELECT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point({lng} {lat})')) AND c.majcompflag='Yes' ORDER BY c.comppct_r DESC"
        r = httpx.post(
            "https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest",
            json={"query": query, "format": "JSON"},
            timeout=15
        )
        data, err = safe_json(r)
        if err:
            results["status"] = "error"
            results["detail"] = f"ssurgo_{err}"
            results["location"] = {"lat": lat, "lng": lng}
            return results
        rows = (data or {}).get("Table", [])
        if rows:
            row = rows[0]
            results["series"] = row[2] if len(row) > 2 else None
            results["map_unit"] = row[0] if len(row) > 0 else None
            results["drainage"] = row[4] if len(row) > 4 else None
            results["hydro_group"] = row[5] if len(row) > 5 else None
            results["depth_to_water_cm"] = row[7] if len(row) > 7 else None
            results["source"] = "USDA SSURGO via SDMDataAccess"
            results["status"] = "found"
        else:
            results["status"] = "no_data"
    except Exception as e:
        results["status"] = "error"
        results["detail"] = str(e)

    results["location"] = {"lat": lat, "lng": lng}
    return results


# ── /anomaly — subsidence + void + depression detection ──────────────
@app.get("/anomaly")
def anomaly(lat: float, lng: float):
    results = {
        "anomaly_score": 0,
        "confidence": 0.0,
        "flags": [],
        "indicators": {},
        "rec_recommended": False,
    }
    score = 0
    flags = []

    catalog = Client.open("https://earth-search.aws.element84.com/v1")

    # ── NDVI depression check ──
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
            b04 = item.assets.get("red") or item.assets.get("B04")
            b08 = item.assets.get("nir") or item.assets.get("B08")
            if b04 and b08:
                b04v = sample_cog_point(b04.href if hasattr(b04, "href") else b04.get("href"), lng, lat)
                b08v = sample_cog_point(b08.href if hasattr(b08, "href") else b08.get("href"), lng, lat)
                if b04v and b08v and (b04v + b08v) > 0:
                    ndvi = (b08v - b04v) / (b08v + b04v)
                    results["indicators"]["ndvi"] = round(ndvi, 4)
                    if ndvi < 0.05:
                        score += 2
                        flags.append("NDVI near zero — bare/disturbed surface or void")
                    elif ndvi < 0.15:
                        score += 1
                        flags.append("Low NDVI — possible stressed vegetation or depression")
    except Exception as e:
        results["indicators"]["ndvi_error"] = str(e)

    # ── Elevation depression check via EPQS ──
    try:
        offsets = [(0.001, 0), (-0.001, 0), (0, 0.001), (0, -0.001)]
        elevs = []
        for dlat, dlng in [(0, 0)] + offsets:
            r = httpx.get(
                f"https://epqs.nationalmap.gov/v1/json?x={lng + dlng}&y={lat + dlat}&wkid=4326&units=Meters&includeDate=false",
                timeout=8
            )
            val = r.json().get("value")
            if val and float(val) > -1000000:
                elevs.append(float(val))
        if len(elevs) >= 3:
            center = elevs[0]
            neighbors = elevs[1:]
            avg_neighbor = sum(neighbors) / len(neighbors)
            depression = avg_neighbor - center
            results["indicators"]["elevation_center_m"] = round(center, 2)
            results["indicators"]["elevation_neighbors_avg_m"] = round(avg_neighbor, 2)
            results["indicators"]["depression_m"] = round(depression, 2)
            if depression > 1.5:
                score += 2
                flags.append(f"Topographic depression detected: {round(depression, 2)}m below surroundings")
            elif depression > 0.5:
                score += 1
                flags.append(f"Minor topographic low: {round(depression, 2)}m below surroundings")
    except Exception as e:
        results["indicators"]["elevation_error"] = str(e)

    # ── SAR scene check ──
    try:
        search = catalog.search(
            collections=["sentinel-1-grd"],
            intersects={"type": "Point", "coordinates": [lng, lat]},
            max_items=2
        )
        items = list(search.items())
        if items:
            results["indicators"]["sar_confirmed"] = True
            results["indicators"]["sar_orbit"] = items[0].properties.get("sat:orbit_state")
        else:
            score += 1
            flags.append("No SAR coverage — data gap in this region")
    except Exception as e:
        results["indicators"]["sar_error"] = str(e)

    confidence = min(1.0, round(score / 6, 2))
    rec = score >= 3

    results["anomaly_score"] = score
    results["anomaly_score_max"] = 6
    results["confidence"] = confidence
    results["flags"] = flags
    results["rec_recommended"] = rec
    results["rec_note"] = "Phase II investigation recommended" if rec else "No anomalies requiring Phase II at this time"
    results["location"] = {"lat": lat, "lng": lng}
    return results
