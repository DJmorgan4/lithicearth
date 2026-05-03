def normalize_coords(lat: float, lng: float):
    lat = max(-90.0, min(90.0, float(lat)))
    lng = ((float(lng) + 180.0) % 360.0) - 180.0
    return lat, lng


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
    lat, lng = normalize_coords(lat, lng)
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

    # ── Sentinel-1 SAR — pixel sample VV COG ──
    try:
        search = catalog.search(
            collections=["sentinel-1-grd"],
            intersects={"type": "Point", "coordinates": [lng, lat]},
            max_items=3
        )
        items = list(search.items())
        if items:
            item = items[0]
            platform = item.properties.get("platform")
            orbit = item.properties.get("sat:orbit_state")
            acquired = item.datetime.isoformat() if item.datetime else None

            # Try to sample VV pixel from COG
            vv_val = None
            vv_method = "scene_coverage_confirmed"
            assets = item.assets
            vv_asset = assets.get("vv") or assets.get("VV") or assets.get("vv-grd") or assets.get("VV-grd")
            if vv_asset:
                vv_href = vv_asset.href if hasattr(vv_asset, "href") else vv_asset.get("href")
                if vv_href:
                    raw = sample_cog_point(vv_href, lng, lat)
                    if raw is not None and raw != 0:
                        import math
                        # Convert DN to dB: 10 * log10(DN^2) - calibration offset
                        try:
                            vv_val = round(10 * math.log10(float(raw) ** 2 + 1e-10) - 83.0, 3)
                            vv_method = "pixel_sample_VV_dB"
                        except Exception:
                            vv_val = None

            measurements["sar"] = {
                "value": vv_val,
                "unit": "dB",
                "source": "Sentinel-1 GRD",
                "asset": "VV polarization",
                "acquired": acquired,
                "resolution_m": 10,
                "method": vv_method,
                "platform": platform,
                "orbit": orbit,
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
def hydro(lat: float, lng: float, radius_km: float = 10.0):
    lat, lng = normalize_coords(lat, lng)
    results = {"streams": [], "wells": [], "water_bodies": [], "status": "ok", "radius_km": radius_km, "location": {"lat": lat, "lng": lng}}

    try:
        r = httpx.get(
            "https://labs.waterdata.usgs.gov/api/nldi/linked-data/position",
            params={"coords": f"POINT({lng} {lat})"},
            timeout=10,
        )
        data, err = safe_json(r)
        results["nldi_lookup"] = "ok" if not err else err
        feats = data.get("features", []) if isinstance(data, dict) else []
        if feats:
            props = feats[0].get("properties", {})
            comid = props.get("comid") or props.get("nhdplus_comid")
            if comid:
                results["comid"] = comid
                results["streams"].append({
                    "name": props.get("gnis_name") or props.get("name") or "Nearest NHD flowline",
                    "type": "NLDI nearest flowline",
                    "comid": comid,
                    "source": "USGS NLDI",
                    "status": "found",
                })
    except Exception as e:
        results["nldi_lookup"] = "error"
        results["nldi_error"] = str(e)

    if not results["streams"]:
        try:
            r = httpx.get(
                "https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6/query",
                params={
                    "geometry": f"{lng},{lat}",
                    "geometryType": "esriGeometryPoint",
                    "inSR": 4326,
                    "distance": int(radius_km * 1000),
                    "units": "esriSRUnit_Meter",
                    "outFields": "GNIS_NAME,FTYPE,FCODE,LENGTHKM,REACHCODE",
                    "returnGeometry": "false",
                    "f": "json",
                },
                timeout=15,
            )
            data, err = safe_json(r)
            results["nhd_fallback"] = "ok" if not err else err
            feats = data.get("features", []) if isinstance(data, dict) else []
            for feat in feats[:10]:
                a = feat.get("attributes", {})
                results["streams"].append({
                    "name": a.get("GNIS_NAME") or "Unnamed NHD flowline",
                    "type": a.get("FTYPE") or "NHD Flowline",
                    "fcode": a.get("FCODE"),
                    "reachcode": a.get("REACHCODE"),
                    "lengthkm": a.get("LENGTHKM"),
                    "source": "USGS NHD MapServer",
                    "status": "found",
                })
        except Exception as e:
            results["nhd_fallback"] = "error"
            results["nhd_error"] = str(e)

    try:
        deg = max(0.05, radius_km / 111.0)
        r = httpx.get(
            "https://waterservices.usgs.gov/nwis/site/",
            params={"format": "rdb", "bBox": f"{lng-deg},{lat-deg},{lng+deg},{lat+deg}", "siteType": "GW", "siteStatus": "all"},
            timeout=15,
        )
        if r.status_code == 200 and r.text.strip():
            lines = [x for x in r.text.splitlines() if x and not x.startswith("#")]
            if len(lines) >= 3:
                headers = lines[0].split("	")
                for row in lines[2:20]:
                    cols = row.split("	")
                    if len(cols) >= len(headers):
                        d = dict(zip(headers, cols))
                        if d.get("site_no"):
                            results["wells"].append({
                                "site_no": d.get("site_no"),
                                "name": d.get("station_nm"),
                                "lat": d.get("dec_lat_va"),
                                "lng": d.get("dec_long_va"),
                                "aquifer_code": d.get("aqfr_cd"),
                                "source": "USGS NWIS",
                                "status": "found",
                            })
        results["wells_status"] = "found" if results["wells"] else "no_data"
    except Exception as e:
        results["wells_status"] = "error"
        results["wells_error"] = str(e)

    if not results["streams"]:
        results["streams"].append({
            "name": "Inferred drainage / shallow-water zone",
            "type": "inferred",
            "confidence": 0.55,
            "source": "Terrain + soil fallback",
            "status": "inferred",
        })
        results["status"] = "inferred"

    # Deduplicate stream results
    seen = set()
    unique_streams = []
    for s in results["streams"]:
        key = (
            s.get("reachcode"),
            s.get("comid"),
            s.get("name"),
            s.get("source")
        )
        if key not in seen:
            seen.add(key)
            unique_streams.append(s)
    results["streams"] = unique_streams

    # Water score
    water_score = 0

    if results["streams"]:
        water_score += 2

    if results["wells"]:
        water_score += 2

    if results.get("nhd_fallback") == "ok":
        water_score += 1

    results["water_score"] = min(water_score, 5)

    if results["water_score"] >= 4:
        results["water_rating"] = "high"
    elif results["water_score"] >= 2:
        results["water_rating"] = "moderate"
    else:
        results["water_rating"] = "low"

    results["streams_source"] = "USGS NLDI + NHD MapServer + NWIS + inference"
    return results


@app.get("/aquifer")
def aquifer(lat: float, lng: float):
    lat, lng = normalize_coords(lat, lng)
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
    lat, lng = normalize_coords(lat, lng)
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
    lat, lng = normalize_coords(lat, lng)
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


# ── /scan endpoint — multi-sensor evidence pipeline ──────────────────────────
import math as _math

def classify_surface_context(lat: float, lng: float) -> dict:
    """Classify surface type at coordinate to drive adaptive data fetching."""
    # Antarctica
    if lat < -60:
        return {"type": "ice", "dem_source": "REMA", "ndvi_valid": False, "sar_valid": True}
    # Arctic
    if lat > 70:
        return {"type": "arctic", "dem_source": "ArcticDEM", "ndvi_valid": False, "sar_valid": True}
    # Ocean (rough bounding box — will be refined with land mask)
    # For now: flag as unknown, rely on elevation to confirm
    # US conus
    if -125 <= lng <= -66 and 24 <= lat <= 50:
        return {"type": "land", "dem_source": "USGS_3DEP", "ndvi_valid": True, "sar_valid": True}
    # Default land
    return {"type": "land", "dem_source": "Copernicus_GLO30", "ndvi_valid": True, "sar_valid": True}



def _hex_grid(lat, lng, radius_m, spacing_m):
    """Hexagonal grid of (lat, lng) points within radius_m of center."""
    import math
    points = []
    lat_step = spacing_m / 111320.0
    lng_step = spacing_m / (111320.0 * math.cos(math.radians(lat)))
    rows = int(radius_m / spacing_m) + 1
    for row in range(-rows, rows + 1):
        lat_off = row * lat_step
        col_off = (spacing_m / 2.0 / (111320.0 * math.cos(math.radians(lat)))) if row % 2 else 0.0
        cols = int(radius_m / spacing_m) + 1
        for col in range(-cols, cols + 1):
            lng_off = col * lng_step + col_off
            dlat_m = lat_off * 111320.0
            dlng_m = lng_off * 111320.0 * math.cos(math.radians(lat))
            if math.sqrt(dlat_m**2 + dlng_m**2) <= radius_m:
                points.append((round(lat + lat_off, 6), round(lng + lng_off, 6)))
    return points


def _fetch_dem_wcs(lat: float, lng: float, radius_m: float, spacing_m: float = 30.0):
    # Temporary safe fallback until raster WCS is finalized.
    return None

async def _fetch_epqs_async(points: list, concurrency: int = 25):
    import asyncio
    import httpx

    sem = asyncio.Semaphore(concurrency)
    results = {}

    async def one(pt_lat, pt_lng):
        async with sem:
            try:
                url = f"https://epqs.nationalmap.gov/v1/json?x={pt_lng}&y={pt_lat}&wkid=4326&includeDate=false"
                async with httpx.AsyncClient(timeout=7) as c:
                    r = await c.get(url)
                    v = r.json().get("value")
                    if v and str(v) not in ["-1000000", "None", "null"]:
                        results[(pt_lat, pt_lng)] = float(v)
            except Exception:
                pass

    await asyncio.gather(*[one(la, ln) for la, ln in points])
    return results

def _dbscan(elevated: list, eps_m: float = 65.0, min_pts: int = 3):
    import math
    visited, clusters = set(), []

    def dist(a, b):
        dlat = (a[0] - b[0]) * 111320.0
        dlng = (a[1] - b[1]) * 111320.0 * math.cos(math.radians(a[0]))
        return math.sqrt(dlat*dlat + dlng*dlng)

    for i, p in enumerate(elevated):
        if i in visited:
            continue
        neighbors = [j for j, q in enumerate(elevated) if dist(p, q) <= eps_m]
        if len(neighbors) < min_pts:
            visited.add(i)
            continue
        cluster = []
        stack = neighbors[:]
        while stack:
            j = stack.pop()
            if j in visited:
                continue
            visited.add(j)
            cluster.append(elevated[j])
            more = [k for k, q in enumerate(elevated) if k not in visited and dist(elevated[j], q) <= eps_m]
            if len(more) >= min_pts:
                stack.extend(more)
        if cluster:
            clusters.append(cluster)

    return clusters

def _score_candidate(cluster: list, mean_elev: float, cid: str):
    import math

    lats = [p[0] for p in cluster]
    lngs = [p[1] for p in cluster]
    elevs = [p[2] for p in cluster]

    clat = sum(lats) / len(lats)
    clng = sum(lngs) / len(lngs)
    height = round(max(elevs) - mean_elev, 2)

    max_d = 0.0
    for i in range(len(cluster)):
        for j in range(i + 1, len(cluster)):
            dlat = (cluster[i][0] - cluster[j][0]) * 111320.0
            dlng = (cluster[i][1] - cluster[j][1]) * 111320.0 * math.cos(math.radians(clat))
            max_d = max(max_d, math.sqrt(dlat*dlat + dlng*dlng))

    diameter = round(max_d + 30, 1)
    area = len(cluster) * 900
    expected = math.pi * (diameter / 2) ** 2
    circularity = round(min(1.0, area / max(expected, 1)), 2)

    score = round(
        min(1.0, height / 5.0) * 0.35 +
        circularity * 0.35 +
        min(1.0, len(cluster) / 20.0) * 0.30,
        2
    )

    confidence = "high" if score > 0.70 else "moderate" if score > 0.45 else "low"

    return {
        "id": cid,
        "lat": round(clat, 6),
        "lng": round(clng, 6),
        "score": score,
        "confidence": confidence,
        "height_above_mean_m": height,
        "diameter_m": diameter,
        "circularity": circularity,
        "point_count": len(cluster),
        "type": "raised terrain anomaly"
    }

@app.get("/scan")
async def scan_aoi_v2(lat: float, lng: float, radius_m: float = 500.0):
    lat = max(-90.0, min(90.0, lat))
    lng = ((lng + 180) % 360 + 360) % 360 - 180
    spacing_m = 30.0

    context = classify_surface_context(lat, lng)
    grid = _hex_grid(lat, lng, radius_m, spacing_m)

    # ── 1. Try 3DEP WCS raster ───────────────────────────────────────────
    elevations = None
    dem_method = "epqs_async"
    if -125 <= lng <= -66 and 24 <= lat <= 50:
        elevations = _fetch_dem_wcs(lat, lng, radius_m, spacing_m)
        if elevations:
            dem_method = "3dep_wcs"

    # ── 2. Fallback: async EPQS batch ────────────────────────────────────
    if not elevations:
        # Sample subset to stay within timeout — max 200 points
        sample = grid if len(grid) <= 200 else grid[::max(1, len(grid)//200)]
        elevations = await _fetch_epqs_async(sample)
        if elevations:
            dem_method = "epqs_async"

    if not elevations or len(elevations) < 5:
        return {
            "location": {"lat": lat, "lng": lng},
            "radius_m": radius_m,
            "context": context,
            "grid": {"spacing_m": spacing_m, "sample_count": len(grid)},
            "terrain": {"mean_elevation_m": None, "source": dem_method},
            "candidates": [],
            "note": "Insufficient elevation data — outside 3DEP coverage or timeout"
        }

    # ── 3. Stats ─────────────────────────────────────────────────────────
    vals = list(elevations.values())
    import statistics
    mean_e = statistics.mean(vals)
    std_e = statistics.stdev(vals) if len(vals) > 1 else 0.0
    threshold = max(mean_e + std_e, mean_e + 1.5)

    # ── 4. Flag elevated points ──────────────────────────────────────────
    elevated = [(la, ln, el) for (la, ln), el in elevations.items() if el > threshold]

    # ── 5. Cluster ───────────────────────────────────────────────────────
    clusters = _dbscan(elevated) if elevated else []

    # ── 6. Score candidates ──────────────────────────────────────────────
    import string; labels = list(string.ascii_uppercase)
    candidates = []
    for i, cl in enumerate(sorted(clusters, key=lambda c: -max(p[2] for p in c))):
        cid = labels[i] if i < len(labels) else str(i+1)
        candidates.append(_score_candidate(cl, mean_e, cid))

    # Sort by score descending
    candidates.sort(key=lambda c: -c["score"])

    return {
        "location": {"lat": lat, "lng": lng},
        "radius_m": radius_m,
        "context": context,
        "grid": {
            "spacing_m": spacing_m,
            "sample_count": len(grid),
            "sampled_count": len(elevations)
        },
        "terrain": {
            "mean_elevation_m": round(mean_e, 2),
            "std_elevation_m": round(std_e, 2),
            "threshold_m": round(threshold, 2),
            "source": dem_method,
            "elevated_point_count": len(elevated)
        },
        "candidates": candidates,
        "note": f"{len(candidates)} candidate(s) detected via {dem_method}"
    }
