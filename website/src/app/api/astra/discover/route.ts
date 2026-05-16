import { NextRequest, NextResponse } from 'next/server'

type Candidate = {
  id: string; name: string; lat: number; lng: number
  type: string; score: number; reason: string
  layers: string[]; brief: string[]; signals?: string[]
  tags?: Record<string, string>; distance_m?: number
}

function classifyIntent(q: string) {
  const t = q.toLowerCase()
  if (t.includes('dog') && (t.includes('water') || t.includes('lake') || t.includes('swim') || t.includes('hike') || t.includes('family'))) return 'dog_family_water'
  if (t.includes('off grid') || t.includes('offgrid') || t.includes('remote') || t.includes('lowkey') || t.includes('low key') || t.includes('national park') || t.includes('national forest') || t.includes('blm')) return 'offgrid_public_land'
  if (t.includes('ranch') || t.includes('farm') || t.includes('hunting land') || t.includes('lease')) return 'ranch_farm_land'
  if (t.includes('wetland') || t.includes('habitat') || t.includes('wildlife') || t.includes('bird') || t.includes('waterfowl') || t.includes('duck')) return 'wildlife_habitat'
  if (t.includes('crane') || t.includes('hunting') || t.includes('wma') || t.includes('tpwd')) return 'hunting_wildlife'
  if (t.includes('dog') || t.includes('lake') || t.includes('water') || t.includes('swim') || t.includes('fish')) return 'public_water_recreation'
  if (t.includes('trail') || t.includes('hike') || t.includes('camp') || t.includes('backpack')) return 'trails_public_land'
  if (t.includes('historic') || t.includes('archaeolog') || t.includes('mound') || t.includes('old')) return 'historical_location'
  if (t.includes('flood') || t.includes('erosion') || t.includes('watershed') || t.includes('environment')) return 'environmental_risk'
  return 'general_environmental'
}

async function geocodeQuery(q: string) {
  const match = q.match(/\b(?:near|around|in|at)\s+(.+?)(?:\s+(?:for|with|that|where|to|and)|$)/i)
  const place = match?.[1]?.replace(/[?.!]/g, '').trim()
  if (!place) return null
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(place)}`, {
    headers: { 'User-Agent': 'LithicEarth-ASTRA/1.0' },
    next: { revalidate: 86400 },
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
  if (t.includes('fort worth') || t.includes('ftw')) return { lat: 32.7555, lng: -97.3308 }
  if (t.includes('austin')) return { lat: 30.2672, lng: -97.7431 }
  if (t.includes('san antonio')) return { lat: 29.4241, lng: -98.4936 }
  if (t.includes('east texas')) return { lat: 31.5, lng: -94.7 }
  if (t.includes('hill country')) return { lat: 30.3, lng: -99.5 }
  if (t.includes('panhandle')) return { lat: 35.2, lng: -101.8 }
  if (t.includes('texas') || t.includes('tx') || t.includes('crane') || t.includes('wma')) return { lat: 31.5, lng: -99.0 }
  return { lat: 33.1972, lng: -96.6398 }
}

function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

function filtersFor(intent: string, radius: number, lat: number, lng: number) {
  const ar = `(around:${radius},${lat},${lng})`

  if (intent === 'dog_family_water') return `
    node${ar}["natural"="water"]; way${ar}["natural"="water"]; relation${ar}["natural"="water"];
    node${ar}["water"~"lake|reservoir|pond|river"]; way${ar}["water"~"lake|reservoir|pond|river"];
    node${ar}["leisure"~"park|nature_reserve|swimming_area"]; way${ar}["leisure"~"park|nature_reserve|swimming_area"]; relation${ar}["leisure"~"park|nature_reserve"];
    node${ar}["highway"~"path|footway|track"]; way${ar}["highway"~"path|footway|track"];
    node${ar}["dog"="yes"]; way${ar}["dog"="yes"];
    node${ar}["tourism"~"camp_site|picnic_site"]; way${ar}["tourism"~"camp_site|picnic_site"];
    node${ar}["boundary"="protected_area"]; way${ar}["boundary"="protected_area"]; relation${ar}["boundary"="protected_area"];
  `

  if (intent === 'offgrid_public_land') return `
    relation${ar}["boundary"="national_park"]; way${ar}["boundary"="national_park"];
    relation${ar}["boundary"="protected_area"]; way${ar}["boundary"="protected_area"];
    relation${ar}["leisure"="nature_reserve"]; way${ar}["leisure"="nature_reserve"];
    node${ar}["natural"="water"]; way${ar}["natural"="water"]; relation${ar}["natural"="water"];
    node${ar}["natural"~"peak|ridge|valley|wood|forest"]; way${ar}["natural"~"wood|forest"];
    node${ar}["highway"~"track|path"]; way${ar}["highway"~"track|path"];
    node${ar}["tourism"~"camp_site|wilderness_hut"]; way${ar}["tourism"~"camp_site|wilderness_hut"];
    node${ar}["landuse"~"forest|meadow|grass"]; way${ar}["landuse"~"forest|meadow|grass"];
  `

  if (intent === 'ranch_farm_land') return `
    node${ar}["landuse"~"farmland|meadow|ranch|grass"]; way${ar}["landuse"~"farmland|meadow|ranch|grass"]; relation${ar}["landuse"~"farmland|meadow"];
    node${ar}["natural"="wetland"]; way${ar}["natural"="wetland"]; relation${ar}["natural"="wetland"];
    node${ar}["natural"="water"]; way${ar}["natural"="water"]; relation${ar}["natural"="water"];
    node${ar}["leisure"="nature_reserve"]; way${ar}["leisure"="nature_reserve"]; relation${ar}["leisure"="nature_reserve"];
    node${ar}["waterway"~"river|stream|canal"]; way${ar}["waterway"~"river|stream|canal"];
    node${ar}["boundary"="protected_area"]; way${ar}["boundary"="protected_area"]; relation${ar}["boundary"="protected_area"];
  `

  if (intent === 'hunting_wildlife' || intent === 'wildlife_habitat') return `
    node${ar}["natural"="wetland"]; way${ar}["natural"="wetland"]; relation${ar}["natural"="wetland"];
    node${ar}["leisure"="nature_reserve"]; way${ar}["leisure"="nature_reserve"]; relation${ar}["leisure"="nature_reserve"];
    node${ar}["boundary"="protected_area"]; way${ar}["boundary"="protected_area"]; relation${ar}["boundary"="protected_area"];
    node${ar}["natural"="water"]; way${ar}["natural"="water"]; relation${ar}["natural"="water"];
    node${ar}["waterway"~"river|stream"]; way${ar}["waterway"~"river|stream"];
    node${ar}["landuse"~"farmland|meadow"]; way${ar}["landuse"~"farmland|meadow"];
  `

  if (intent === 'public_water_recreation') return `
    node${ar}["natural"="water"]; way${ar}["natural"="water"]; relation${ar}["natural"="water"];
    node${ar}["water"]; way${ar}["water"]; relation${ar}["water"];
    node${ar}["leisure"="park"]; way${ar}["leisure"="park"]; relation${ar}["leisure"="park"];
    node${ar}["highway"~"path|footway|cycleway|track"]; way${ar}["highway"~"path|footway|cycleway|track"];
    node${ar}["tourism"~"camp_site|picnic_site|viewpoint"]; way${ar}["tourism"~"camp_site|picnic_site|viewpoint"];
  `

  if (intent === 'trails_public_land') return `
    node${ar}["highway"~"path|footway|track"]; way${ar}["highway"~"path|footway|track"];
    relation${ar}["route"="hiking"]; way${ar}["route"="hiking"];
    node${ar}["boundary"="protected_area"]; way${ar}["boundary"="protected_area"]; relation${ar}["boundary"="protected_area"];
    node${ar}["leisure"~"nature_reserve|park"]; way${ar}["leisure"~"nature_reserve|park"];
    node${ar}["natural"~"water|wood|peak|ridge"]; way${ar}["natural"~"water|wood|ridge"];
  `

  if (intent === 'historical_location') return `
    node${ar}["historic"]; way${ar}["historic"]; relation${ar}["historic"];
    node${ar}["natural"="water"]; way${ar}["natural"="water"];
    node${ar}["waterway"]; way${ar}["waterway"];
  `

  return `
    node${ar}["natural"]; way${ar}["natural"]; relation${ar}["natural"];
    node${ar}["waterway"]; way${ar}["waterway"];
    node${ar}["leisure"]; way${ar}["leisure"];
    node${ar}["boundary"="protected_area"]; way${ar}["boundary"="protected_area"]; relation${ar}["boundary"="protected_area"];
  `
}

function scoreFeature(tags: Record<string, string>, intent: string, distance_m: number) {
  const signals: string[] = []
  let score = 48
  const add = (s: string, pts: number) => { signals.push(s); score += pts }

  if (tags.natural === 'water' || tags.water) add('water', 16)
  if (tags.natural === 'wetland') add('wetland', 22)
  if (tags.highway && /path|footway|track|cycleway/.test(tags.highway)) add('trail-access', 12)
  if (tags.leisure === 'park' || tags.leisure === 'nature_reserve') add('public-recreation', 14)
  if (tags.boundary === 'protected_area') add('protected-area', 18)
  if (tags.boundary === 'national_park') add('national-park', 22)
  if (tags.historic || tags.archaeological_site) add('historic', 18)
  if (tags.tourism) add('tourism-access', 8)
  if (tags.access === 'yes' || tags.access === 'permissive') add('access-positive', 8)
  if (tags.dog === 'yes') add('dog-friendly', 14)
  if (tags.landuse === 'farmland' || tags.landuse === 'meadow') add('rural-land', 10)
  if (tags.waterway) add('waterway', 12)
  if (tags.tourism === 'camp_site') add('campsite', 10)

  // Intent boosters
  if (intent === 'dog_family_water' && signals.includes('water')) score += 14
  if (intent === 'dog_family_water' && signals.includes('dog-friendly')) score += 12
  if (intent === 'dog_family_water' && signals.includes('public-recreation')) score += 8
  if (intent === 'offgrid_public_land' && signals.includes('national-park')) score += 16
  if (intent === 'offgrid_public_land' && signals.includes('protected-area')) score += 12
  if (intent === 'offgrid_public_land' && signals.includes('water')) score += 8
  if (intent === 'ranch_farm_land' && signals.includes('rural-land')) score += 14
  if (intent === 'ranch_farm_land' && signals.includes('wetland')) score += 10
  if (intent === 'trails_public_land' && signals.includes('trail-access')) score += 10
  if (intent === 'hunting_wildlife' && signals.includes('wetland')) score += 10
  if (intent === 'historical_location' && signals.includes('historic')) score += 12

  score -= Math.min(15, Math.floor(distance_m / 9000))
  return { score: Math.max(35, Math.min(98, score)), signals }
}

function buildBrief(intent: string, tags: Record<string, string>, signals: string[]): string[] {
  const lines: string[] = []
  if (intent === 'dog_family_water') {
    lines.push('Family + dog-friendly water access candidate.')
    if (signals.includes('dog-friendly')) lines.push('Tagged dog-friendly in OSM.')
    lines.push('Verify on-leash rules and swimming access before visiting.')
  } else if (intent === 'offgrid_public_land') {
    lines.push('Remote public land candidate — low development density.')
    if (signals.includes('national-park')) lines.push('National Park or protected federal land.')
    lines.push('Verify access roads, permit requirements, and fire restrictions.')
  } else if (intent === 'ranch_farm_land') {
    lines.push('Rural land candidate — farmland, meadow, or wetland.')
    lines.push('May be private. Verify ownership and access before entry.')
    if (signals.includes('wetland')) lines.push('Wetland features present — waterfowl habitat likely.')
  } else if (intent === 'hunting_wildlife') {
    lines.push('Verify TPWD season, species rules, and current closures before field use.')
  } else {
    lines.push('Live OSM-backed ASTRA discovery.')
  }
  lines.push('Open in Viewer for LiDAR, terrain profile, NDVI, SAR, and AOI scan.')
  return lines
}

async function discover(query: string, intent: string) {
  const geo = await geocodeQuery(query).catch(() => null)
  const center = geo ?? fallbackCenter(query)
  const radius = ['hunting_wildlife', 'offgrid_public_land', 'ranch_farm_land'].includes(intent) ? 150000 : 65000

  const body = `[out:json][timeout:25];\n(\n${filtersFor(intent, radius, center.lat, center.lng)}\n);\nout center tags 50;`

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
    next: { revalidate: 21600 },
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
    const { score, signals } = scoreFeature(tags, intent, distance_m)
    const name = tags.name || tags['gnis:name'] || tags.ref || `${intent.replaceAll('_', ' ')} site ${i + 1}`
    const layers = Array.from(new Set([
      'terrain', 'topo',
      signals.includes('water') || signals.includes('wetland') || signals.includes('waterway') ? 'hydro' : '',
      signals.includes('wetland') ? 'ndvi' : '',
      signals.includes('historic') ? 'lidar' : '',
      intent.includes('hunting') || intent.includes('ranch') ? 'sar' : '',
    ].filter(Boolean)))

    return {
      id: `osm-${el.type}-${el.id}`, name,
      lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)),
      type: signals.join(' + ') || 'environmental feature',
      score, reason: `ASTRA ranked this via ${signals.join(', ') || 'environmental'} signals — ${Math.round(distance_m / 1000)}km from search center.`,
      layers, signals, tags, distance_m,
      brief: buildBrief(intent, tags, signals),
    }
  }).filter(Boolean) as Candidate[]

  return {
    source: 'openstreetmap-overpass',
    center,
    candidates: candidates.sort((a, b) => b.score - a.score).slice(0, 8),
  }
}

function fallback(intent: string): Candidate[] {
  return [{
    id: 'astra-fallback', name: 'ASTRA Fallback — Retry with a place name',
    lat: 33.1972, lng: -96.6398,
    type: 'fallback', score: 55,
    reason: 'Live source unavailable. Try: "find dog-friendly lakes near Dallas TX" or "public hunting land in East Texas".',
    layers: ['terrain', 'topo', 'hydro'],
    signals: ['fallback'],
    brief: ['Add a place name like "near Dallas" or "in Texas Hill Country" for live results.', 'Open Viewer for manual terrain analysis.'],
  }]
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const query = String(body.query || '')
  const intent = classifyIntent(query)
  let source = 'fallback', candidates: Candidate[] = [], center = fallbackCenter(query)
  try {
    const result = await discover(query, intent)
    source = result.source; candidates = result.candidates; center = result.center
  } catch (e) { console.error('ASTRA discovery failed', e) }
  if (!candidates.length) candidates = fallback(intent)

  const synthMap: Record<string, string> = {
    dog_family_water: `ASTRA found ${candidates.length} dog-friendly water and recreation candidates. Ranked by water access, public land status, trail access, and dog-friendly tags.`,
    offgrid_public_land: `ASTRA found ${candidates.length} remote public land candidates. Ranked by protected area status, water features, remoteness, and campsite access.`,
    ranch_farm_land: `ASTRA found ${candidates.length} rural land candidates — farmland, meadows, wetlands. Verify ownership before entry.`,
    hunting_wildlife: `ASTRA found ${candidates.length} wildlife and hunting habitat candidates. Verify TPWD rules before field use.`,
    wildlife_habitat: `ASTRA found ${candidates.length} wildlife habitat candidates ranked by wetland, water, and protected area signals.`,
    public_water_recreation: `ASTRA found ${candidates.length} public water recreation candidates.`,
    trails_public_land: `ASTRA found ${candidates.length} trail and public land candidates.`,
  }

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
        ? 'ASTRA fallback: add a place name like "near Dallas TX" or "in East Texas" for live results.'
        : synthMap[intent] || `ASTRA found ${candidates.length} candidates ranked by environmental signals.`,
      candidates,
    },
  })
}
