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
  signals?: string[]
  tags?: Record<string, string>
  distance_m?: number
}

function classifyIntent(q: string) {
  const t = q.toLowerCase()
  if (t.includes('crane') || t.includes('hunting') || t.includes('wma')) return 'hunting_wildlife'
  if (t.includes('dog') || t.includes('lake') || t.includes('water') || t.includes('swim') || t.includes('fish')) return 'public_water_recreation'
  if (t.includes('trail') || t.includes('hike') || t.includes('camp') || t.includes('backpack')) return 'trails_public_land'
  if (t.includes('historic') || t.includes('archaeolog') || t.includes('mound') || t.includes('old')) return 'historical_location'
  if (t.includes('wetland') || t.includes('habitat') || t.includes('wildlife') || t.includes('bird')) return 'wildlife_habitat'
  if (t.includes('flood') || t.includes('erosion') || t.includes('watershed') || t.includes('environment')) return 'environmental_risk'
  return 'general_environmental'
}

async function geocodeQuery(q: string) {
  const match = q.match(/\b(?:near|around|in)\s+(.+)$/i)
  const place = match?.[1]?.replace(/[?.!]/g, '').trim()
  if (!place) return null

  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(place)}`, {
    headers: { 'User-Agent': 'LithicEarth-ASTRA/1.0' },
    next: { revalidate: 60 * 60 * 24 },
  })

  if (!res.ok) return null
  const data = await res.json()
  const hit = data?.[0]
  if (!hit) return null
  return { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name }
}

function fallbackCenter(q: string) {
  const t = q.toLowerCase()
  if (t.includes('dallas')) return { lat: 32.7767, lng: -96.797 }
  if (t.includes('mckinney')) return { lat: 33.1972, lng: -96.6398 }
  if (t.includes('texas') || t.includes('crane')) return { lat: 33.9, lng: -101.2 }
  if (t.includes('denver')) return { lat: 39.7392, lng: -104.9903 }
  return { lat: 33.17429, lng: -96.61903 }
}

function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

function filtersFor(intent: string, radius: number, lat: number, lng: number) {
  const around = `(around:${radius},${lat},${lng})`

  if (intent === 'public_water_recreation') return `
    node${around}["natural"="water"]; way${around}["natural"="water"]; relation${around}["natural"="water"];
    node${around}["water"]; way${around}["water"]; relation${around}["water"];
    node${around}["leisure"="park"]; way${around}["leisure"="park"]; relation${around}["leisure"="park"];
    node${around}["highway"~"path|footway|cycleway|track"]; way${around}["highway"~"path|footway|cycleway|track"];
    node${around}["tourism"~"camp_site|picnic_site|viewpoint"]; way${around}["tourism"~"camp_site|picnic_site|viewpoint"];
  `

  if (intent === 'trails_public_land') return `
    node${around}["highway"~"path|footway|track"]; way${around}["highway"~"path|footway|track"];
    node${around}["route"="hiking"]; way${around}["route"="hiking"]; relation${around}["route"="hiking"];
    node${around}["boundary"="protected_area"]; way${around}["boundary"="protected_area"]; relation${around}["boundary"="protected_area"];
    node${around}["leisure"~"nature_reserve|park"]; way${around}["leisure"~"nature_reserve|park"];
    node${around}["natural"~"water|wood|peak|ridge"]; way${around}["natural"~"water|wood|ridge"];
  `

  if (intent === 'hunting_wildlife' || intent === 'wildlife_habitat') return `
    node${around}["natural"="wetland"]; way${around}["natural"="wetland"]; relation${around}["natural"="wetland"];
    node${around}["leisure"="nature_reserve"]; way${around}["leisure"="nature_reserve"]; relation${around}["leisure"="nature_reserve"];
    node${around}["boundary"="protected_area"]; way${around}["boundary"="protected_area"]; relation${around}["boundary"="protected_area"];
    node${around}["natural"="water"]; way${around}["natural"="water"]; relation${around}["natural"="water"];
  `

  if (intent === 'historical_location') return `
    node${around}["historic"]; way${around}["historic"]; relation${around}["historic"];
    node${around}["archaeological_site"]; way${around}["archaeological_site"]; relation${around}["archaeological_site"];
    node${around}["natural"="water"]; way${around}["natural"="water"];
    node${around}["waterway"]; way${around}["waterway"];
  `

  return `
    node${around}["natural"]; way${around}["natural"]; relation${around}["natural"];
    node${around}["waterway"]; way${around}["waterway"];
    node${around}["leisure"]; way${around}["leisure"];
    node${around}["boundary"="protected_area"]; way${around}["boundary"="protected_area"]; relation${around}["boundary"="protected_area"];
  `
}

function scoreFeature(tags: Record<string, string>, intent: string, distance_m: number) {
  const signals: string[] = []
  let score = 48

  const add = (signal: string, points: number) => {
    signals.push(signal)
    score += points
  }

  if (tags.natural === 'water' || tags.water) add('water', 16)
  if (tags.natural === 'wetland') add('wetland', 22)
  if (tags.highway && /path|footway|track|cycleway/.test(tags.highway)) add('trail-access', 12)
  if (tags.leisure === 'park' || tags.leisure === 'nature_reserve') add('public-recreation', 14)
  if (tags.boundary === 'protected_area') add('protected-area', 18)
  if (tags.historic || tags.archaeological_site) add('historic', 18)
  if (tags.tourism) add('tourism-access', 8)
  if (tags.access === 'yes' || tags.access === 'permissive') add('access-positive', 8)
  if (tags.dog === 'yes') add('dog-friendly', 10)

  if (intent === 'public_water_recreation' && signals.includes('water')) score += 10
  if (intent === 'trails_public_land' && signals.includes('trail-access')) score += 10
  if (intent === 'hunting_wildlife' && signals.includes('wetland')) score += 10
  if (intent === 'historical_location' && signals.includes('historic')) score += 12

  score -= Math.min(15, Math.floor(distance_m / 9000))

  return { score: Math.max(35, Math.min(98, score)), signals }
}

async function discover(query: string, intent: string): Promise<{ source: string; candidates: Candidate[]; center: { lat: number; lng: number } }> {
  const geo = await geocodeQuery(query).catch(() => null)
  const center = geo || fallbackCenter(query)
  const radius = intent === 'hunting_wildlife' ? 120000 : 55000

  const body = `
    [out:json][timeout:22];
    (
      ${filtersFor(intent, radius, center.lat, center.lng)}
    );
    out center tags 40;
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

  const candidates = elements.map((el: any, i: number): Candidate | null => {
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

    const tags = el.tags || {}
    const distance_m = meters(center, { lat, lng })
    const scored = scoreFeature(tags, intent, distance_m)

    const name = tags.name || tags['gnis:name'] || tags.ref || `${intent.replaceAll('_', ' ')} candidate ${i + 1}`

    const layers = Array.from(new Set([
      'terrain',
      'topo',
      scored.signals.includes('water') || scored.signals.includes('wetland') ? 'hydro' : '',
      scored.signals.includes('wetland') ? 'ndvi' : '',
      scored.signals.includes('historic') ? 'lidar' : '',
      intent.includes('hunting') ? 'sar' : '',
      intent.includes('historical') ? 'geology' : '',
    ].filter(Boolean)))

    return {
      id: `osm-${el.type}-${el.id}`,
      name,
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      type: scored.signals.join(' + ') || 'environmental feature',
      score: scored.score,
      reason: `ASTRA ranked this using ${scored.signals.join(', ') || 'environmental'} signals, ${distance_m}m from search center.`,
      layers,
      signals: scored.signals,
      tags,
      distance_m,
      brief: [
        'Live OSM-backed ASTRA discovery.',
        'Open in Viewer for LiDAR, topo, terrain profile, AOI scan, and spectral overlays.',
        intent === 'hunting_wildlife'
          ? 'Verify TPWD season, access, species rules, legal boundaries, and current closures before field use.'
          : 'Verify access, ownership, rules, and closures before travel.',
      ],
    }
  }).filter(Boolean) as Candidate[]

  return {
    source: 'openstreetmap-overpass+nominatim',
    center,
    candidates: candidates.sort((a, b) => b.score - a.score).slice(0, 8),
  }
}

function fallback(intent: string): Candidate[] {
  return [{
    id: 'astra-fallback',
    name: 'ASTRA Fallback Recon Candidate',
    lat: 33.17429,
    lng: -96.61903,
    type: 'fallback environmental recon',
    score: 62,
    reason: 'Live source unavailable. ASTRA returned a safe fallback candidate.',
    layers: ['terrain', 'topo', 'hydro', 'lidar'],
    signals: ['fallback'],
    brief: ['Retry with a place name like near Dallas, near McKinney, or in Texas.', 'Open Viewer for manual analysis.'],
  }]
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const query = String(body.query || '')
  const intent = classifyIntent(query)

  let source = 'fallback'
  let candidates: Candidate[] = []
  let center = fallbackCenter(query)

  try {
    const result = await discover(query, intent)
    source = result.source
    candidates = result.candidates
    center = result.center
  } catch (e) {
    console.error('ASTRA live discovery failed', e)
  }

  if (!candidates.length) candidates = fallback(intent)

  return NextResponse.json({
    ok: true,
    astra: {
      mode: 'ASTRA_DISCOVERY_GLOBE',
      source,
      intent,
      query,
      center,
      recommended_layers: Array.from(new Set(candidates.flatMap(c => c.layers))),
      synthesis: source === 'fallback'
        ? 'ASTRA fallback mode: live environmental sources unavailable or no candidates found.'
        : `ASTRA found ${candidates.length} live environmental candidates and ranked them by water, wetland, trail, public-land, historic, access, and distance signals.`,
      candidates,
    },
  })
}
