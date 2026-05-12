 
 
import { NextRequest, NextResponse } from 'next/server'

const GEO_API = process.env.GEO_API_URL || 'https://lithicearth-production.up.railway.app'
const ASTRA_URL = 'https://astarteworks.com/api/astra/query'

const LAYER_CONTEXT: Record<string, string> = {
  cdse_sar_vv: 'Sentinel-1 SAR IW-VV dB — surface roughness, soil moisture, subsurface void expression',
  cdse_sar_vh: 'Sentinel-1 SAR IW-VH dB — vegetation structure, bare soil contrast, subsurface moisture',
  cdse_ndvi: 'Sentinel-2 NDVI — normalized vegetation index, plant health, bare soil detection',
  cdse_false_color: 'Sentinel-2 false color NIR — vegetation density, stressed vegetation, soil exposure',
  cdse_moisture: 'Sentinel-2 moisture index — subsurface and surface water content, drainage patterns',
  cdse_swir: 'Sentinel-2 SWIR — mineral composition, moisture in soil and vegetation',
  cdse_geology: 'Sentinel-2 geology composite — lithological mapping, rock type discrimination',
  cdse_ndwi: 'Sentinel-2 NDWI — surface water bodies, wetland extent',
  lidar: 'USGS 3DEP LiDAR index — bare earth elevation, point cloud coverage',
  lidar_hs: 'USGS 3DEP LiDAR hillshade — terrain relief, micro-topographic features',
  lidar_1m: 'USGS 3DEP 1m hillshade — high-resolution terrain, individual feature resolution',
  hydro: 'USGS NHD hydrology — stream networks, drainage basins, flow direction',
  fema: 'FEMA NFHL floodplain — 100-year flood zones, floodway delineation',
  nwi: 'USFWS NWI wetlands — jurisdictional wetland mapping, wetland type classification',
  geology: 'USGS geologic map — bedrock geology, surficial deposits, fault locations',
  terrain: 'Esri hillshade — regional topography, slope, aspect',
  topo: 'USGS topo — contour lines, elevation, named features',
  satellite: 'Esri World Imagery — high-resolution satellite base imagery',
}

export async function POST(req: NextRequest) {
  try {
    const { lat, lng, activeLayers, reportType, notes, location, aoi } = await req.json()
    if (!lat || !lng) return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })

    // 1. MSIGI scan
    let scanData: any = {}
    try {
      const r = await fetch(`${GEO_API}/scan?lat=${lat}&lng=${lng}`, { signal: AbortSignal.timeout(30000) })
      scanData = await r.json()
    } catch { scanData = { error: 'scan timeout' } }

    // 2. Build layer context
    const layerLines = (activeLayers || [])
      .map((id: string) => LAYER_CONTEXT[id] ? `• ${id}: ${LAYER_CONTEXT[id]}` : null)
      .filter(Boolean).join('\n')

    // 3. Scan summary
    const t = scanData?.terrain
    const s = scanData?.spectral
    const sar = scanData?.sar
    const mu = scanData?.muon_baseline
    const scanSummary = t ? `
TERRAIN: mean ${t.mean_elevation_m}m | std ±${t.std_elevation_m}m | ${t.elevated_point_count} elevated pts | source: ${t.source}
SPECTRAL: NDVI ${s?.ndvi_mean ?? 'N/A'} | cloud ${s?.cloud_cover ?? 'N/A'}% | date ${s?.date ?? 'N/A'}
SAR: ${sar?.platform ?? 'N/A'} | ${sar?.date ?? 'N/A'} | valid: ${sar?.valid ?? false}
MUON: ${mu?.flux_m2_min ?? 'N/A'}/m²/min | Kp ${mu?.kp_index ?? 'N/A'}
CANDIDATES: ${scanData.candidates?.length ?? 0} detected
${scanData.candidates?.slice(0,3).map((c: any) => `  ${c.id}: score ${c.score} (DEM:${c.dem_score} NDVI:${c.ndvi_score} SAR:${c.sar_score})`).join('\n') ?? ''}` : 'Scan unavailable'

    // 4. ASTRA message
    const msg = `Generate a LithicEarth MSIGI Field Intelligence Report layer interpretation.

SITE: ${lat}, ${lng} — ${location || 'unspecified'}
REPORT TYPE: ${reportType || 'msigi'}
ANALYST NOTES: ${notes || 'none'}

ACTIVE DATA LAYERS:
${layerLines || 'none specified'}

LIVE MSIGI SCAN DATA:
${scanSummary}

For each active layer, interpret:
1. What this layer shows at THIS specific location based on the scan values
2. Notable anomalies or features visible in this layer at these coordinates
3. Environmental or archaeological significance
4. Any Phase I ESA flags or concerns

Close with an MSIGI SYNTHESIS — what the full multi-sensor picture indicates about subsurface conditions, environmental risk, and site intelligence at this location. Reference actual scan values throughout.`

    // 5. ASTRA call
    let astraInterpretation = ''
    try {
      const ar = await fetch(ASTRA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: [] }),
        signal: AbortSignal.timeout(55000)
      })
      const ad = await ar.json()
      astraInterpretation = ad.response || ad.error || 'ASTRA unavailable'
    } catch { astraInterpretation = 'ASTRA timeout' }

    // 6. ASTRA learning — feed scan back into knowledge base
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      await sb.from('astra_knowledge').insert({
        domain: 'lithicearth_scans',
        section: `scan_${String(lat).replace('.','')}_${String(lng).replace('.','')}_${new Date().toISOString().slice(0,10)}`,
        content: `MSIGI scan at ${lat},${lng} (${location || 'TX'}) on ${new Date().toISOString().slice(0,10)}.${scanSummary}\nASTRA: ${astraInterpretation.slice(0,600)}`,
      })
    } catch (e) { console.error('ASTRA learning failed:', e) }

    // Fetch Mapbox static satellite map with candidate markers + AOI bbox
    let mapImageBase64 = ''
    try {
      const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
      if (MAPBOX_TOKEN && lat && lng) {
        const candidates = scanData?.candidates?.slice(0,5) || []
        const markers = candidates.map((c: any, i: number) =>
          `pin-s-${String.fromCharCode(65+i)}+2F5D8C(${c.lng},${c.lat})`
        ).join(',')

        // If AOI is a rectangle/polygon, use bbox auto-fit instead of fixed zoom
        // AOI geometry is GeoJSON with coordinates in [lng,lat] order
        let mapUrl = ''
        const size = '800x500'
        if (aoi && aoi.type === 'Polygon' && aoi.coordinates?.[0]?.length >= 4) {
          const ring = aoi.coordinates[0] as [number, number][]
          const lngs = ring.map((p: [number,number]) => p[0])
          const lats = ring.map((p: [number,number]) => p[1])
          const west  = Math.min(...lngs)
          const east  = Math.max(...lngs)
          const south = Math.min(...lats)
          const north = Math.max(...lats)
          const overlay = markers ? `${markers},` : ''
          // Use bbox auto-fit: [west,south,east,north]
          mapUrl = `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${overlay}${lng},${lat},13,0/${size}@2x?access_token=${MAPBOX_TOKEN}&bbox=${west},${south},${east},${north}`
        } else {
          // Pin point — fixed zoom centered on point
          const overlay = markers ? `${markers},` : ''
          mapUrl = `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${overlay}${lng},${lat},14,0/${size}@2x?access_token=${MAPBOX_TOKEN}`
        }

        const mapRes = await fetch(mapUrl, { signal: AbortSignal.timeout(10000) })
        if (mapRes.ok) {
          const buf = await mapRes.arrayBuffer()
          mapImageBase64 = `data:image/png;base64,${Buffer.from(buf).toString('base64')}`
        }
      }
    } catch (e) {
      console.error('Static map fetch failed:', e)
    }

    // Fetch terrain + NDVI map images from LithicEarth engine
    let terrainImageBase64 = ''
    let ndviImageBase64 = ''
    try {
      const GEO_API = process.env.NEXT_PUBLIC_GEO_API || 'https://lithicearth-production.up.railway.app'
      const mapsRes = await fetch(`${GEO_API}/maps?lat=${lat}&lng=${lng}&radius_m=1000`, {
        signal: AbortSignal.timeout(30000)
      })
      if (mapsRes.ok) {
        const mapsData = await mapsRes.json()
        if (mapsData.terrain) terrainImageBase64 = `data:image/png;base64,${mapsData.terrain}`
        if (mapsData.ndvi) ndviImageBase64 = `data:image/png;base64,${mapsData.ndvi}`
      }
    } catch (e) {
      console.error('Maps fetch failed:', e)
    }

    return NextResponse.json({
      scan: scanData,
      astra_interpretation: astraInterpretation,
      layers_analyzed: activeLayers,
      location: { lat, lng, address: location },
      generated_at: new Date().toISOString(),
      map_image: mapImageBase64,
      terrain_image: terrainImageBase64,
      ndvi_image: ndviImageBase64,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
