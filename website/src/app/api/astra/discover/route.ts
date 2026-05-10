import { NextRequest, NextResponse } from 'next/server'

type Candidate = {
  id: string
  name: string
  lat: number
  lng: number
  type: string
  score: number
  reason: string
  layers: string[]
  brief: string[]
}

function classifyIntent(q: string) {
  const text = q.toLowerCase()

  if (text.includes('crane') || text.includes('hunting') || text.includes('wma')) return 'texas_hunting'
  if (text.includes('dog') || text.includes('lake') || text.includes('water') || text.includes('public land')) return 'public_water_recreation'
  if (text.includes('historic') || text.includes('archaeolog') || text.includes('earthwork') || text.includes('mound')) return 'historical_location'
  if (text.includes('wildlife') || text.includes('habitat') || text.includes('wetland')) return 'wildlife_habitat'

  return 'general_discovery'
}

function queryCenter(q: string) {
  const text = q.toLowerCase()

  if (text.includes('dallas')) return { lat: 32.7767, lng: -96.797 }
  if (text.includes('mckinney')) return { lat: 33.1972, lng: -96.6398 }
  if (text.includes('texas') || text.includes('sandhill') || text.includes('crane')) return { lat: 33.9, lng: -101.2 }
  if (text.includes('denver')) return { lat: 39.7392, lng: -104.9903 }

  return { lat: 33.17429, lng: -96.61903 }
}

async function overpassCandidates(query: string, intent: string): Promise<Candidate[]> {
  const center = queryCenter(query)
  const radius = intent === 'texas_hunting' ? 90000 : 45000

  const filters =
    intent === 'public_water_recreation'
      ? `
        node(around:${radius},${center.lat},${center.lng})["natural"="water"];
        way(around:${radius},${center.lat},${center.lng})["natural"="water"];
        relation(around:${radius},${center.lat},${center.lng})["natural"="water"];
        node(around:${radius},${center.lat},${center.lng})["leisure"="park"];
        way(around:${radius},${center.lat},${center.lng})["leisure"="park"];
        node(around:${radius},${center.lat},${center.lng})["highway"="path"];
        way(around:${radius},${center.lat},${center.lng})["highway"="path"];
      `
      : intent === 'texas_hunting' || intent === 'wildlife_habitat'
        ? `
          node(around:${radius},${center.lat},${center.lng})["natural"="wetland"];
          way(around:${radius},${center.lat},${center.lng})["natural"="wetland"];
          relation(around:${radius},${center.lat},${center.lng})["natural"="wetland"];
          node(around:${radius},${center.lat},${center.lng})["leisure"="nature_reserve"];
          way(around:${radius},${center.lat},${center.lng})["leisure"="nature_reserve"];
          relation(around:${radius},${center.lat},${center.lng})["boundary"="protected_area"];
        `
        : `
          node(around:${radius},${center.lat},${center.lng})["historic"];
          way(around:${radius},${center.lat},${center.lng})["historic"];
          node(around:${radius},${center.lat},${center.lng})["natural"="water"];
          way(around:${radius},${center.lat},${center.lng})["natural"="water"];
        `

  const body = `
    [out:json][timeout:18];
    (
      ${filters}
    );
    out center tags 25;
  `

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
    next: { revalidate: 60 * 60 * 6 },
  })

  if (!res.ok) throw new Error('Overpass unavailable')

  const data = await res.json()
  const elements = Array.isArray(data.elements) ? data.elements : []

  return elements
    .map((el: any, i: number): Candidate | null => {
      const lat = el.lat ?? el.center?.lat
      const lng = el.lon ?? el.center?.lon
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

      const tags = el.tags || {}
      const name =
        tags.name ||
        tags['gnis:name'] ||
        tags.ref ||
        `${intent.replaceAll('_', ' ')} candidate ${i + 1}`

      const isWater = tags.natural === 'water' || tags.water
      const isWetland = tags.natural === 'wetland'
      const isTrail = tags.highway === 'path' || tags.highway === 'footway'
      const isPark = tags.leisure === 'park' || tags.boundary === 'protected_area'
      const isHistoric = Boolean(tags.historic)

      const score =
        62 +
        (isWater ? 12 : 0) +
        (isWetland ? 18 : 0) +
        (isTrail ? 7 : 0) +
        (isPark ? 9 : 0) +
        (isHistoric ? 14 : 0) +
        Math.min(i, 8)

      return {
        id: `osm-${el.type}-${el.id}`,
        name,
        lat: Number(lat.toFixed(5)),
        lng: Number(lng.toFixed(5)),
        type: isWetland
          ? 'Wetland / Habitat Candidate'
          : isWater
            ? 'Waterbody Candidate'
            : isTrail
              ? 'Trail / Access Candidate'
              : isHistoric
                ? 'Historic Candidate'
                : 'Public-Land Signal',
        score: Math.min(score, 96),
        reason: `Live OSM signal matched ASTRA intent: ${Object.entries(tags).slice(0, 4).map(([k, v]) => `${k}=${v}`).join(', ') || 'spatial feature'}.`,
        layers: isWetland
          ? ['wetlands', 'hydro', 'ndvi', 'terrain']
          : isWater
            ? ['hydro', 'terrain', 'ndvi', 'topo']
            : isHistoric
              ? ['lidar', 'terrain', 'hydro', 'geology']
              : ['terrain', 'hydro', 'topo'],
        brief: [
          'Live OpenStreetMap feature discovered by ASTRA.',
          'Verify access, ownership, closures, and local rules before field use.',
          'Open in Viewer for LiDAR, topo, AOI, terrain profile, and scan overlays.',
        ],
      }
    })
    .filter(Boolean)
    .sort((a: Candidate, b: Candidate) => b.score - a.score)
    .slice(0, 8)
}

function fallbackCandidates(intent: string): Candidate[] {
  if (intent === 'texas_hunting') {
    return [{
      id: 'tx-crane-panhandle-playa',
      name: 'Texas Panhandle Playa-Wetland Corridor',
      lat: 34.872,
      lng: -101.704,
      type: 'Sandhill Crane / Wetland Search Zone',
      score: 91,
      reason: 'Fallback ASTRA pattern: playa wetlands, agricultural fields, open visibility, public-land screening required.',
      layers: ['wetlands', 'hydro', 'terrain', 'sar', 'ndvi'],
      brief: ['Verify TPWD rules before field use.', 'Inspect wetlands, fields, access, and legal boundaries.', 'Use Viewer for terrain and AOI screening.'],
    }]
  }

  return [{
    id: 'general-astra-recon',
    name: 'ASTRA General Recon Candidate',
    lat: 33.17429,
    lng: -96.61903,
    type: 'General Spatial Intelligence',
    score: 72,
    reason: 'Fallback ASTRA candidate. Refine query with public land, wildlife, historical, water, or hunting intent.',
    layers: ['terrain', 'hydro', 'ndvi', 'lidar'],
    brief: ['Ask ASTRA for a specific mission.', 'Open in Viewer for overlays.', 'Verify access and rules.'],
  }]
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const query = String(body.query || '')
  const intent = classifyIntent(query)

  let source = 'fallback'
  let candidates: Candidate[] = []

  try {
    candidates = await overpassCandidates(query, intent)
    if (candidates.length) source = 'openstreetmap-overpass'
  } catch (e) {
    console.error('ASTRA Overpass discovery failed', e)
  }

  if (!candidates.length) candidates = fallbackCandidates(intent)

  const center = candidates[0]
    ? { lat: candidates[0].lat, lng: candidates[0].lng }
    : queryCenter(query)

  return NextResponse.json({
    ok: true,
    astra: {
      mode: 'ASTRA_DISCOVERY_GLOBE',
      source,
      intent,
      query,
      center,
      recommended_layers: Array.from(new Set(candidates.flatMap(c => c.layers))),
      synthesis:
        source === 'openstreetmap-overpass'
          ? `ASTRA found ${candidates.length} live map candidates from OpenStreetMap/Overpass and selected the strongest spatial matches.`
          : 'ASTRA generated fallback spatial reconnaissance candidates from the query.',
      candidates,
    },
  })
}
