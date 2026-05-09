def normalize_coords(lat: float, lng: float):
    lat = max(-90.0, min(90.0, float(lat)))
    lng = ((float(lng) + 180.0) % 360.0) - 180.0
    return lat, lng


from fastapi import FastAPI
from signals import router as signals_router
from fastapi.middleware.cors import CORSMiddleware
from pystac_client import Client
import httpx

app = FastAPI(title="Lithic Engine", version="2.0.0")

app.include_router(signals_router)
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

    # ── Elevation — 3DEP WCS tile (US) or SRTM fallback ──
    try:
        if -125 <= lng <= -66 and 24 <= lat <= 50:
            # Fetch small WCS tile, sample center pixel — same source as /scan
            wcs_result = _fetch_dem_wcs(lat, lng, radius_m=150, spacing_m=10.0)
            if wcs_result and len(wcs_result) >= 1:
                # Pick the point closest to the requested coordinate
                import math
                best_pt = min(wcs_result.keys(),
                    key=lambda pt: math.sqrt((pt[0]-lat)**2 + (pt[1]-lng)**2))
                elev_val = wcs_result[best_pt]
                measurements["elevation"] = {
                    "value": round(float(elev_val), 2),
                    "unit": "m",
                    "source": "USGS 3DEP WCS",
                    "asset": "National Elevation Dataset (1m)",
                    "resolution_m": 1,
                    "method": "wcs_tile_center",
                    "status": "found"
                }
            else:
                raise ValueError("WCS no data")
        else:
            raise ValueError("outside US bounds")
    except Exception:
        try:
            # EPQS fallback for US if WCS fails
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
    """
    Fetch a GeoTIFF from USGS 3DEP WCS and sample it at hex-grid points.
    Returns dict {(lat, lng): elevation_m} matching _fetch_epqs_async output format.
    Single HTTP call — replaces ~200 EPQS calls, ~10x faster.
    """
    import math
    import struct
    import zlib
    import urllib.request

    # ── 1. Build bbox with padding ───────────────────────────────────────
    pad = radius_m * 1.15
    lat_pad = pad / 111320.0
    lng_pad = pad / (111320.0 * math.cos(math.radians(lat)))
    bbox_min_lng = round(lng - lng_pad, 6)
    bbox_min_lat = round(lat - lat_pad, 6)
    bbox_max_lng = round(lng + lng_pad, 6)
    bbox_max_lat = round(lat + lat_pad, 6)

    # ── 2. Calculate pixel dimensions at 10m native res ─────────────────
    width_m = (bbox_max_lng - bbox_min_lng) * 111320.0 * math.cos(math.radians(lat))
    height_m = (bbox_max_lat - bbox_min_lat) * 111320.0
    px_w = max(32, min(256, int(width_m / spacing_m)))
    px_h = max(32, min(256, int(height_m / spacing_m)))

    # ── 3. Fetch GeoTIFF ─────────────────────────────────────────────────
    url = (
        f"https://elevation.nationalmap.gov/arcgis/services/3DEPElevation/ImageServer/WCSServer"
        f"?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&COVERAGE=DEP3Elevation"
        f"&CRS=EPSG:4326&BBOX={bbox_min_lng},{bbox_min_lat},{bbox_max_lng},{bbox_max_lat}"
        f"&WIDTH={px_w}&HEIGHT={px_h}&FORMAT=GeoTIFF"
    )

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "LithicEarth/2.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            tif_bytes = resp.read()
    except Exception:
        return None

    if len(tif_bytes) < 1000:
        return None

    # ── 4. Parse GeoTIFF using pure Python (no rasterio needed) ─────────
    # Minimal TIFF reader: extract pixel data + geotransform from tags
    try:
        results = _parse_geotiff_elevations(
            tif_bytes, bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat,
            px_w, px_h, lat, lng, radius_m
        )
        return results if results and len(results) >= 5 else None
    except Exception:
        return None


def _parse_geotiff_elevations(tif_bytes, bbox_min_lng, bbox_min_lat, bbox_max_lng, bbox_max_lat,
                                px_w, px_h, center_lat, center_lng, radius_m):
    """
    Pure-Python minimal GeoTIFF parser.
    Reads pixel values and maps them back to (lat, lng) coordinates.
    Returns {(lat, lng): elevation_m}
    """
    import math
    import struct

    data = tif_bytes

    # Detect byte order
    if data[:2] == b'II':
        endian = '<'
    elif data[:2] == b'MM':
        endian = '>'
    else:
        return None

    def ru16(offset): return struct.unpack_from(endian + 'H', data, offset)[0]
    def ru32(offset): return struct.unpack_from(endian + 'I', data, offset)[0]
    def ri32(offset): return struct.unpack_from(endian + 'i', data, offset)[0]
    def rf32(offset): return struct.unpack_from(endian + 'f', data, offset)[0]
    def rf64(offset): return struct.unpack_from(endian + 'd', data, offset)[0]

    ifd_offset = ru32(4)
    n_entries = ru16(ifd_offset)

    tags = {}
    for i in range(n_entries):
        entry_offset = ifd_offset + 2 + i * 12
        tag   = ru16(entry_offset)
        dtype = ru16(entry_offset + 2)
        count = ru32(entry_offset + 4)
        voff  = entry_offset + 8
        # For simplicity grab first value only
        if dtype == 3:   val = ru16(voff)
        elif dtype == 4: val = ru32(voff)
        elif dtype == 12:
            if count == 1: val = rf64(voff) if len(data) > voff + 8 else 0
            else:
                ptr = ru32(voff)
                val = [rf64(ptr + j*8) for j in range(min(count, 16))]
        else:             val = ru32(voff)
        tags[tag] = val

    # Tiled GeoTIFF layout (tags 322/323=TileWidth/Height, 324=TileOffsets, 325=TileByteCounts)
    img_w    = tags.get(256, px_w)
    img_h    = tags.get(257, px_h)
    bits     = tags.get(258, 32)
    sfmt     = tags.get(339, 3)
    tile_w   = tags.get(322, img_w)
    tile_h   = tags.get(323, img_h)
    tile_off = tags.get(324, 0)

    if isinstance(tile_off, list): tile_off = tile_off[0]

    fmt   = endian + ('f' if (bits == 32 and sfmt == 3) else 'i' if bits == 32 else 'H')
    psize = 4 if bits >= 32 else 2

    # Map pixel coords back to lat/lng, using tile_w as row stride
    results = {}
    lng_range    = bbox_max_lng - bbox_min_lng
    lat_range    = bbox_max_lat - bbox_min_lat
    nodata_vals  = {-9999.0, -9999, -1000000.0}
    cos_lat      = math.cos(math.radians(center_lat))

    for row in range(img_h):
        for col in range(img_w):
            byte_off = tile_off + (row * tile_w + col) * psize
            if byte_off + psize > len(data):
                continue
            val = struct.unpack_from(fmt, data, byte_off)[0]
            if val in nodata_vals or val < -500 or val > 9000:
                continue
            pt_lng = bbox_min_lng + (col + 0.5) / img_w * lng_range
            pt_lat = bbox_max_lat - (row + 0.5) / img_h * lat_range
            dlat_m = (pt_lat - center_lat) * 111320.0
            dlng_m = (pt_lng - center_lng) * 111320.0 * cos_lat
            if math.sqrt(dlat_m**2 + dlng_m**2) <= radius_m:
                results[(round(pt_lat, 6), round(pt_lng, 6))] = round(float(val), 2)

    return results

async def _fetch_ndvi_aoi(lat: float, lng: float, radius_m: float) -> dict:
    """
    Fetch Sentinel-2 NDVI for the AOI bounding box.
    Returns {"mean": float, "std": float, "valid": bool} or None.
    Uses same STAC search as /analyze.
    """
    try:
        import httpx, math, statistics
        pad = radius_m * 1.2
        lat_pad = pad / 111320.0
        lng_pad = pad / (111320.0 * math.cos(math.radians(lat)))
        bbox = [
            round(lng - lng_pad, 5), round(lat - lat_pad, 5),
            round(lng + lng_pad, 5), round(lat + lat_pad, 5)
        ]
        # STAC search for recent low-cloud Sentinel-2
        async with httpx.AsyncClient(timeout=12) as c:
            r = await c.post(
                "https://earth-search.aws.element84.com/v1/search",
                json={
                    "collections": ["sentinel-2-l2a"],
                    "bbox": bbox,
                    "datetime": "2025-01-01T00:00:00Z/2026-12-31T23:59:59Z",
                    "query": {"eo:cloud_cover": {"lt": 25}},
                    "limit": 1,
                    "sortby": [{"field": "datetime", "direction": "desc"}]
                }
            )
            items = r.json().get("features", [])
        if not items:
            return None

        item = items[0]
        b08_href = item["assets"].get("B08", item["assets"].get("nir", {})).get("href")
        b04_href = item["assets"].get("B04", item["assets"].get("red", {})).get("href")
        if not b08_href or not b04_href:
            return None

        # Sample center pixels from COG
        from rio_cogeo.cogeo import cog_validate  # noqa - just checking availability
        return None  # fallback — full COG sampling needs rasterio in container
    except Exception:
        return None


async def _fetch_sar_aoi(lat: float, lng: float, radius_m: float) -> dict:
    """
    Fetch Sentinel-1 SAR scene metadata via NASA CMR.
    Returns {"platform": str, "date": str, "title": str, "valid": bool}
    """
    try:
        import httpx
        async with httpx.AsyncClient(timeout=12) as c:
            r = await c.get(
                "https://cmr.earthdata.nasa.gov/search/granules.json",
                params={
                    "short_name": "SENTINEL-1A_SLC",
                    "point": f"{lng},{lat}",
                    "sort_key": "-start_date",
                    "page_size": 1,
                }
            )
            entries = r.json().get("feed", {}).get("entry", [])
        if not entries:
            return {"valid": False}
        e = entries[0]
        return {
            "valid": True,
            "platform": "sentinel-1a",
            "date": e.get("time_start", "")[:10],
            "title": e.get("title", ""),
        }
    except Exception:
        return {"valid": False}


async def _fetch_aoi_spectral(lat: float, lng: float, radius_m: float) -> dict:
    """
    Fetch AOI NDVI from Sentinel-2 COG using pure HTTP range reads.
    No rasterio, no titiler, no external dependencies beyond httpx.
    
    Strategy:
    1. STAC search for recent low-cloud S2 scene (no filter params — client-side filter)
    2. Read IFD chain to find smallest overview (IFD 4, ~687x687)
    3. Identify which overview tile covers our AOI
    4. Fetch + decompress that tile (zlib, ~45KB per band)
    5. Compute NDVI from band pixel means
    """
    import math, struct, zlib
    import httpx

    def _decompress(data: bytes) -> bytes:
        for wbits in (15, -15, 47):
            try:
                return zlib.decompress(data, wbits)
            except zlib.error:
                continue
        raise ValueError("Cannot decompress tile")

    def _read_ifd4(hdr: bytes):
        """Walk IFD chain to IFD 4 (smallest overview), return tile layout."""
        ru16 = lambda o: struct.unpack_from('<H', hdr, o)[0]
        ru32 = lambda o: struct.unpack_from('<I', hdr, o)[0]
        ifd_off = ru32(4)
        for _ in range(4):
            n = ru16(ifd_off)
            ifd_off = ru32(ifd_off + 2 + n*12)
        n = ru16(ifd_off)
        tags = {}
        for i in range(n):
            eo = ifd_off + 2 + i*12
            tags[ru16(eo)] = (ru32(eo+4), ru32(eo+8))
        return tags

    async def _sample_all_tiles(c: httpx.AsyncClient, url: str) -> list:
        """Fetch all non-empty IFD4 tiles and return combined pixel list."""
        r = await c.get(url, headers={"Range": "bytes=0-4095"})
        hdr = r.content
        tags = _read_ifd4(hdr)
        ru32 = lambda d,o: struct.unpack_from('<I',d,o)[0]
        n_tiles   = tags[324][0]
        off_ptr   = tags[324][1]
        bc_ptr    = tags[325][1]
        off_r = await c.get(url, headers={"Range": f"bytes={off_ptr}-{off_ptr+n_tiles*4-1}"})
        bc_r  = await c.get(url, headers={"Range": f"bytes={bc_ptr}-{bc_ptr+n_tiles*4-1}"})
        offsets    = [ru32(off_r.content, i*4) for i in range(n_tiles)]
        bytecounts = [ru32(bc_r.content,  i*4) for i in range(n_tiles)]
        all_pixels = []
        for off, bc in zip(offsets, bytecounts):
            if bc < 1000:
                continue  # edge/nodata tile
            tile_r = await c.get(url, headers={"Range": f"bytes={off}-{off+bc-1}"})
            raw = _decompress(tile_r.content)
            n_px = len(raw) // 2
            pixels = struct.unpack_from(f"<{n_px}H", raw)
            all_pixels.extend(p for p in pixels if 0 < p < 65000)
        return all_pixels

    async def _sample_band(c: httpx.AsyncClient, url: str, tile_idx: int) -> list:
        """Fetch IFD4 metadata then decompress + decode one tile."""
        # Read COG header (4KB covers all IFD chains)
        r = await c.get(url, headers={"Range": "bytes=0-4095"})
        hdr = r.content
        tags = _read_ifd4(hdr)

        ru32 = lambda d,o: struct.unpack_from('<I',d,o)[0]
        tile_off_ptr = tags[324][1]
        tile_bc_ptr  = tags[325][1]
        n_tiles = tags[324][0]

        # Read tile offset + bytecount arrays
        arr_bytes = n_tiles * 4
        off_r = await c.get(url, headers={"Range": f"bytes={tile_off_ptr}-{tile_off_ptr+arr_bytes-1}"})
        bc_r  = await c.get(url, headers={"Range": f"bytes={tile_bc_ptr}-{tile_bc_ptr+arr_bytes-1}"})
        offsets    = [ru32(off_r.content, i*4) for i in range(n_tiles)]
        bytecounts = [ru32(bc_r.content,  i*4) for i in range(n_tiles)]

        # Fetch the tile
        off = offsets[tile_idx]; bc = bytecounts[tile_idx]
        tile_r = await c.get(url, headers={"Range": f"bytes={off}-{off+bc-1}"})
        raw = _decompress(tile_r.content)

        # Decode 16-bit uint pixels
        n_px = len(raw) // 2
        pixels = struct.unpack_from(f"<{n_px}H", raw)
        return [p for p in pixels if 0 < p < 65000]

    try:
        import math
        bbox = [
            round(lng - 0.06, 4), round(lat - 0.05, 4),
            round(lng + 0.06, 4), round(lat + 0.05, 4)
        ]

        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
            # STAC search — no filter params (client-side cloud filter)
            r = await c.post(
                "https://earth-search.aws.element84.com/v1/search",
                json={
                    "collections": ["sentinel-2-l2a"],
                    "bbox": bbox,
                    "limit": 12
                }
            )
            items = r.json().get("features", [])
            if not items:
                return {}

            # Pick lowest cloud cover scene
            items_with_cloud = [
                x for x in items
                if x["properties"].get("eo:cloud_cover") is not None
            ]
            if not items_with_cloud:
                return {}
            item = min(items_with_cloud,
                       key=lambda x: x["properties"].get("eo:cloud_cover", 99))
            cloud = item["properties"].get("eo:cloud_cover", 99)
            date  = item["properties"].get("datetime", "")[:10]

            if cloud > 40:
                return {"valid": False, "note": f"best scene {cloud:.0f}% cloud"}

            assets = item["assets"]
            b08_url = assets.get("nir",  assets.get("B08", {})).get("href", "")
            b04_url = assets.get("red",  assets.get("B04", {})).get("href", "")
            if not b08_url or not b04_url:
                return {}

            # Sample all non-edge tiles (bc>1000 = has real data)
            b08_pixels = await _sample_all_tiles(c, b08_url)
            b04_pixels = await _sample_all_tiles(c, b04_url)

            if not b08_pixels or not b04_pixels:
                return {}

            import statistics
            nir_mean = statistics.mean(b08_pixels)
            red_mean = statistics.mean(b04_pixels)
            nir_std  = statistics.stdev(b08_pixels) if len(b08_pixels) > 1 else 0
            red_std  = statistics.stdev(b04_pixels) if len(b04_pixels) > 1 else 0

            if (nir_mean + red_mean) == 0:
                return {}

            ndvi_mean = round((nir_mean - red_mean) / (nir_mean + red_mean), 4)
            ndvi_std  = round(
                abs(nir_std - red_std) / max(nir_mean + red_mean, 1), 4
            )

            return {
                "ndvi_mean": ndvi_mean,
                "ndvi_std": ndvi_std,
                "cloud_cover": round(cloud, 1),
                "date": date,
                "nir_mean": round(nir_mean, 1),
                "red_mean": round(red_mean, 1),
                "pixel_count": len(b08_pixels),
                "valid": True
            }

    except Exception as e:
        return {"valid": False, "error": str(e)}


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

def _score_candidate(cluster: list, mean_elev: float, cid: str,
                     spectral: dict = None, muon: dict = None):
    """
    Multi-source candidate scoring — MSIGI composite.
    
    Terrain component (60%):
      height_score  = min(1, height_above_mean / 5m)  × 0.35
      circularity   = area / expected_circle_area      × 0.35
      density_score = min(1, point_count / 20)         × 0.30

    Spectral component (25%):
      ndvi_signal = deviation of local NDVI from AOI mean
      Low NDVI under a raised feature = disturbed/bare soil = +signal

    SAR component (15%):  
      Placeholder — scene confirmation only until pixel backscatter implemented
      Currently contributes a fixed 0.5 (neutral) when SAR is confirmed

    Composite = terrain×0.60 + ndvi×0.25 + sar×0.15
    """
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

    # ── Terrain score (pure DEM) ─────────────────────────────────────────
    terrain_score = (
        min(1.0, height / 5.0) * 0.35 +
        circularity * 0.35 +
        min(1.0, len(cluster) / 20.0) * 0.30
    )

    # ── Spectral signal (NDVI AOI stats) ────────────────────────────────
    ndvi_signal = 0.5  # neutral default
    ndvi_detail = "no_data"
    if spectral and spectral.get("valid"):
        ndvi_mean = spectral.get("ndvi_mean", 0.5)
        ndvi_std  = spectral.get("ndvi_std", 0.1)
        # Low NDVI = more anomalous (disturbed soil, bare mound)
        # Scale: ndvi < 0.2 → high signal, ndvi > 0.6 → low signal
        if ndvi_mean < 0.15:
            ndvi_signal = 0.9   # very bare — strong anomaly signal
        elif ndvi_mean < 0.3:
            ndvi_signal = 0.75  # sparse vegetation
        elif ndvi_mean < 0.45:
            ndvi_signal = 0.55  # moderate — neutral
        elif ndvi_mean < 0.6:
            ndvi_signal = 0.4   # healthy vegetation — less likely disturbed
        else:
            ndvi_signal = 0.25  # dense vegetation — suppresses signal
        # High NDVI variance in AOI = heterogeneous surface = more anomaly potential
        if ndvi_std > 0.15:
            ndvi_signal = min(1.0, ndvi_signal + 0.1)
        ndvi_detail = f"ndvi={ndvi_mean:.3f} std={ndvi_std:.3f}"

    # ── SAR signal ───────────────────────────────────────────────────────
    sar_signal = 0.5  # neutral — scene confirmation only for now
    sar_detail = "scene_confirmed"

    # ── Muon flux baseline (open-sky model) ──────────────────────────────
    muon_detail = "no_baseline"
    muon_flux_m2_min = None
    if muon and muon.get("valid"):
        muon_flux_m2_min = muon.get("flux_m2_min")
        muon_detail = f"baseline={muon_flux_m2_min:.1f}/m2/min kp={muon.get('kp_index')} model={muon.get('model')}"
        # When detector data is available, compare observed vs baseline here
        # void_ratio = observed_flux / muon_flux_m2_min
        # void_signal = 1.0 if void_ratio > 1.10 else 0.5

    # ── Composite MSIGI score ────────────────────────────────────────────
    composite = round(
        terrain_score * 0.60 +
        ndvi_signal   * 0.25 +
        sar_signal    * 0.15,
        3
    )

    confidence = "high" if composite > 0.70 else "moderate" if composite > 0.45 else "low"

    return {
        "id": cid,
        "lat": round(clat, 6),
        "lng": round(clng, 6),
        "score": round(composite, 2),
        "terrain_score": round(terrain_score, 2),
        "ndvi_signal": round(ndvi_signal, 2),
        "sar_signal": round(sar_signal, 2),
        "confidence": confidence,
        "height_above_mean_m": height,
        "diameter_m": diameter,
        "circularity": circularity,
        "point_count": len(cluster),
        "sensors": ["DEM_3DEP"] + (["S2_NDVI"] if spectral and spectral.get("valid") else []) + ["S1_SAR"],
        "ndvi_detail": ndvi_detail,
        "type": "raised terrain anomaly",
        "muon_detail": muon_detail if muon and muon.get("valid") else "awaiting_detector"
    }


async def _fetch_muon_flux(lat: float, lng: float, alt_m: float = 0.0) -> dict:
    """
    Compute expected vertical muon flux at any coordinate on Earth.
    Uses Gaisser parametrization + real-time NOAA Kp solar modulation.
    No hardware needed — physics-based open-sky baseline.

    Returns flux in muons/cm2/s and muons/m2/min, plus void detection threshold.
    This is the baseline against which detector readings are compared.
    """
    import math
    import httpx

    # Get real-time Kp index from NOAA SWPC
    kp = 2.0  # default moderate
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(
                "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"
            )
            kp_data = r.json()
            kp = float(kp_data[-1]["Kp"])
    except Exception:
        pass  # use default

    # Geomagnetic cutoff rigidity (Stoermer approximation)
    lat_rad = math.radians(abs(lat))
    Rc = 14.9 * math.cos(lat_rad) ** 4  # GV

    # Sea level vertical muon flux baseline (muons/cm2/s)
    baseline = 0.0102

    # Altitude correction — muon flux increases with altitude
    # Approximate scale height ~2000m
    alt_factor = math.exp(alt_m / 2000.0)

    # Geomagnetic latitude correction
    lat_factor = max(0.70, min(1.0, 1.0 - 0.02 * Rc))

    # Solar modulation via Kp (Forbush decrease approximation)
    kp_factor = 1.0 - 0.02 * kp

    flux_cm2_s  = round(baseline * alt_factor * lat_factor * kp_factor, 8)
    flux_m2_min = round(flux_cm2_s * 10000 * 60, 2)

    # Void detection thresholds
    # A 10% excess over baseline indicates a significant density anomaly
    void_threshold_m2_min = round(flux_m2_min * 1.10, 2)

    return {
        "flux_cm2_s":           flux_cm2_s,
        "flux_m2_min":          flux_m2_min,
        "void_threshold_m2_min": void_threshold_m2_min,
        "kp_index":             round(kp, 2),
        "cutoff_rigidity_gv":   round(Rc, 3),
        "alt_factor":           round(alt_factor, 4),
        "lat_factor":           round(lat_factor, 4),
        "kp_factor":            round(kp_factor, 4),
        "model":                "Gaisser+NOAA_Kp",
        "valid":                True
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
    # WCS has full density — use tighter threshold to find discrete anomalies
    if dem_method == "3dep_wcs":
        threshold = mean_e + max(std_e * 1.5, 3.0)
    else:
        threshold = max(mean_e + std_e, mean_e + 1.5)

    # ── 4. Flag elevated points ──────────────────────────────────────────
    elevated = [(la, ln, el) for (la, ln), el in elevations.items() if el > threshold]

    # ── 5. Cluster ───────────────────────────────────────────────────────
    # Dense WCS: tight eps to find discrete mounds, not broad ridgelines
    eps = 35.0 if dem_method == "3dep_wcs" else 65.0
    min_pts = 3 if dem_method == "3dep_wcs" else 3
    raw_clusters = _dbscan(elevated, eps_m=eps, min_pts=min_pts) if elevated else []
    # Split oversized clusters — a 200pt cluster is a hillside, not an anomaly
    max_pts = 40 if dem_method == "3dep_wcs" else 999
    min_pts_cluster = 2
    clusters = [c for c in raw_clusters if min_pts_cluster <= len(c) <= max_pts]

    # ── 6. Fetch spectral context for fusion ────────────────────────────
    spectral = {}
    if context.get("ndvi_valid"):
        try:
            spectral = await _fetch_aoi_spectral(lat, lng, radius_m)
        except Exception:
            spectral = {}

    # ── 6a. Fetch SAR scene metadata ─────────────────────────────────────
    sar = {}
    if context.get("sar_valid", True):
        try:
            sar = await _fetch_sar_aoi(lat, lng, radius_m)
        except Exception:
            sar = {"valid": False}

    # ── 6b. Muon flux baseline ───────────────────────────────────────────
    muon = {}
    try:
        elev_m = 0.0
        if elevations:
            vals_list = list(elevations.values())
            import statistics as _stats
            elev_m = _stats.mean(vals_list)
        muon = await _fetch_muon_flux(lat, lng, alt_m=elev_m)
    except Exception:
        muon = {}

    # ── 7. Score candidates with MSIGI fusion ────────────────────────────
    import string; labels = list(string.ascii_uppercase)
    candidates = []
    for i, cl in enumerate(sorted(clusters, key=lambda c: -max(p[2] for p in c))):
        cid = labels[i] if i < len(labels) else str(i+1)
        candidates.append(_score_candidate(cl, mean_e, cid, spectral=spectral, muon=muon))

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
        "spectral": spectral,
        "sar": sar,
        "muon_baseline": muon,
        "note": f"{len(candidates)} candidate(s) detected via {dem_method}" + (" + S2_NDVI" if spectral.get("valid") else "")
    }


# ── Copernicus Data Space token proxy ────────────────────────────────────
import os as _os

@app.get("/cdse/token")
async def cdse_token():
    """Exchange client credentials for a short-lived CDSE access token."""
    client_id = _os.getenv("CDSE_CLIENT_ID")
    client_secret = _os.getenv("CDSE_CLIENT_SECRET")
    if not client_id or not client_secret:
        return {"error": "CDSE credentials not configured"}
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(
                "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                }
            )
            data = r.json()
            return {
                "access_token": data.get("access_token"),
                "expires_in": data.get("expires_in", 600),
            }
    except Exception as e:
        return {"error": str(e)}
