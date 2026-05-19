import { NextRequest, NextResponse } from 'next/server'

const TPWD_WMA_URL = 'https://services1.arcgis.com/1mtXwieMId59thmg/arcgis/rest/services/WMA/FeatureServer/0/query'

type Candidate = {
  id: string; name: string; lat: number; lng: number
  type: string; score: number; reason: string
  layers: string[]; brief: string[]; signals?: string[]
  tags?: Record<string, string>; distance_m?: number
  source_label?: string
}

// ── Intent classifier ─────────────────────────────────────────────────
function classifyIntent(q: string): string {
  const t = q.toLowerCase()
  if (t.includes('spring') || t.includes('swimming hole') || t.includes('spring-fed')) return 'springs_swimming'
  if (t.includes('cypress') || t.includes('swamp') || t.includes('bayou') || t.includes('marsh') || t.includes('boardwalk')) return 'cypress_swamp_bayou'
  if (t.includes('dispersed') || t.includes('primitive camp') || t.includes('off grid') || t.includes('offgrid') || t.includes('remote') || t.includes('blm') || t.includes('national forest')) return 'offgrid_public_land'
  if (t.includes('canyon') || t.includes('elevation') || t.includes('ridge') || t.includes('terrain') || t.includes('topo') || t.includes('valley') || t.includes('ravine')) return 'terrain_intelligence'
  if (t.includes('lowkey') || t.includes('low key') || t.includes('hidden') || t.includes('secret') || t.includes('overlooked') || t.includes('underrated') || t.includes('locals') || t.includes('undiscovered')) return 'hidden_gem'
  if (t.includes('dog') && (t.includes('water') || t.includes('lake') || t.includes('swim') || t.includes('hike') || t.includes('family') || t.includes('creek'))) return 'dog_family_water'
  if (t.includes('family') && (t.includes('water') || t.includes('creek') || t.includes('hike') || t.includes('camp'))) return 'dog_family_water'
  if (t.includes('ranch') || t.includes('farm') || t.includes('hunting land') || t.includes('lease') || t.includes('hipcamp') || t.includes('conservation ranch')) return 'ranch_farm_land'
  if (t.includes('crane') || t.includes('wma') || t.includes('tpwd') || t.includes('squirrel') || t.includes('deer hunting') || t.includes('walk-in') || t.includes('public hunting')) return 'hunting_wma'
  if (t.includes('hunting') || t.includes('wildlife') || t.includes('waterfowl') || t.includes('duck') || t.includes('wetland')) return 'hunting_wildlife'
  if (t.includes('bird') || t.includes('birding') || t.includes('kayak') || t.includes('habitat')) return 'wildlife_habitat'
  if (t.includes('waterfall') || t.includes('falls') || t.includes('lake') || t.includes('water') || t.includes('swim') || t.includes('fish') || t.includes('fishing')) return 'public_water_recreation'
  if (t.includes('trail') || t.includes('hike') || t.includes('camp') || t.includes('backpack')) return 'trails_public_land'
  if (t.includes('historic') || t.includes('archaeolog') || t.includes('mound') || t.includes('old fort')) return 'historical_location'
  return 'general_environmental'
}

// ── Geocoder ──────────────────────────────────────────────────────────
async function geocodeQuery(q: string) {
  // Try multiple extraction strategies in order of specificity

  // 1. Explicit near/in/around pattern
  const nearMatch = q.match(/\b(?:near|around|in|at|within\s+\d+\s+(?:miles?|hours?)\s+of)\s+([A-Za-z][\w\s,\.]+?)(?:\s+(?:I |for|with|that|where|to|so|and|,|\.|$))/i)

  // 2. "City, State" pattern anywhere in query (e.g. "McKinney, Texas" or "McKinney, TX")
  const cityStateMatch = q.match(/\b([A-Z][a-zA-Z\s]+,\s*(?:Texas|TX|Oklahoma|OK|Louisiana|LA|Arkansas|AR|New Mexico|NM|Colorado|CO|Kansas|KS|Missouri|MO))\b/i)

  // 3. Known Texas city names directly mentioned
  const texasCities = ['mckinney','dallas','houston','austin','san antonio','fort worth','lubbock','amarillo','waco','tyler','nacogdoches','lufkin','conroe','huntsville','bastrop','kerrville','fredericksburg','marble falls','llano','mason','junction','uvalde','del rio','laredo','corpus christi','victoria','bay city','beaumont','port arthur','longview','marshall','texarkana','abilene','midland','odessa','san angelo','el paso','alpine','marfa','presidio','eagle pass','crystal city','edinburg','mcallen','brownsville','harlingen','kingsville','alice','beeville','cuero','seguin','new braunfels','san marcos','buda','kyle','cedar park','round rock','georgetown','taylor','temple','killeen','waco','corsicana','palestine','jacksonville','henderson','carthage','center','san augustine','jasper','woodville','livingston','lufkin','crockett','huntsville','bryan','college station','brenham','la grange','columbus','richmond','sugar land','pearland','league city','galveston','alvin','angleton','lake jackson','freeport','clute','el campo','wharton','bay city','edna','cuero','yoakum','shiner','gonzales','lockhart','luling','slaton','brownfield','lamesa','seminole','monahans','pecos','fort stockton','ozona','sonora','brady','san saba','lampasas','burnet','marble falls','fredericksburg','kerrville','comfort','boerne','helotes','leon valley','kirby','schertz','converse','universal city','live oak','selma','cibolo','new braunfels','seguin','luling','gonzales']
  const tl = q.toLowerCase()
  const cityFound = texasCities.find(c => tl.includes(c))

  // Also try to extract any capitalized place name after near/in/around/at
  const broadMatch = q.match(/\b(?:near|around|in|at|outside|south of|north of|east of|west of|along)\s+([A-Za-z][\w\s]{2,25}?)(?:\s+(?:TX|Texas|County|county|I |for|with|that|where|to|so|and|,|\.|$))/i)
  const broadPlace = broadMatch?.[1]?.trim()

  let place: string | null = null

  if (nearMatch?.[1]) {
    place = nearMatch[1].replace(/[?.!]/g, '').trim()
  } else if (cityStateMatch?.[1]) {
    place = cityStateMatch[1].trim()
  } else if (cityFound) {
    place = cityFound + ', Texas'
  } else if (broadPlace && broadPlace.length > 2) {
    place = broadPlace + ', Texas'
  }

  if (!place || place.length < 3) return null

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=3&q=${encodeURIComponent(place + (place.toLowerCase().includes('texas') || place.toLowerCase().includes(' tx') ? '' : ', Texas'))}&countrycodes=us&viewbox=-106.6,25.8,-93.5,36.5&bounded=0`,
      { headers: { 'User-Agent': 'LithicEarth-ASTRA/2.0' }, next: { revalidate: 86400 } }
    )
    const data = await res.json()
    const hit = data?.[0]
    if (!hit) return null
    return { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name }
  } catch { return null }
}

function fallbackCenter(q: string) {
  const t = q.toLowerCase()
  if (t.includes('houston')) return { lat: 29.7604, lng: -95.3698 }
  if (t.includes('dallas')) return { lat: 32.7767, lng: -96.797 }
  if (t.includes('mckinney')) return { lat: 33.1972, lng: -96.6398 }
  if (t.includes('fort worth') || t.includes('ftw')) return { lat: 32.7555, lng: -97.3308 }
  if (t.includes('austin')) return { lat: 30.2672, lng: -97.7431 }
  if (t.includes('san antonio')) return { lat: 29.4241, lng: -98.4936 }
  if (t.includes('east texas')) return { lat: 31.5, lng: -94.7 }
  if (t.includes('hill country')) return { lat: 30.3, lng: -99.5 }
  if (t.includes('panhandle')) return { lat: 35.2, lng: -101.8 }
  if (t.includes('big bend')) return { lat: 29.25, lng: -103.25 }
  if (t.includes('piney') || t.includes('pineywoods')) return { lat: 31.2, lng: -94.4 }
  if (t.includes('gulf') || t.includes('coast')) return { lat: 28.5, lng: -96.5 }
  if (t.includes('texas') || t.includes(' tx')) return { lat: 31.5, lng: -99.0 }
  return { lat: 31.5, lng: -99.0 }  // default: center of Texas
}

function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

// ── OSM filters by intent ─────────────────────────────────────────────
function filtersFor(intent: string, radius: number, lat: number, lng: number) {
  const ar = `(around:${radius},${lat},${lng})`

  if (intent === 'springs_swimming') return `
    node${ar}["natural"="spring"]; way${ar}["natural"="spring"];
    node${ar}["swimming"="yes"]; way${ar}["swimming"="yes"];
    node${ar}["sport"="swimming"]; way${ar}["sport"="swimming"];
    node${ar}["natural"="water"]["water"~"river|stream|pool"]; way${ar}["natural"="water"]["water"~"river|stream|pool"];
    node${ar}["leisure"="swimming_area"]; way${ar}["leisure"="swimming_area"];
    node${ar}["waterway"~"stream|river"]; way${ar}["waterway"~"stream|river"];
    node${ar}["natural"="waterfall"]; way${ar}["natural"="waterfall"];
    node${ar}["tourism"~"camp_site|picnic_site"]; way${ar}["tourism"~"camp_site|picnic_site"];
    node${ar}["boundary"="protected_area"]; way${ar}["boundary"="protected_area"]; relation${ar}["boundary"="protected_area"];
  `

  if (intent === 'cypress_swamp_bayou') return `
    node${ar}["natural"="wetland"]; way${ar}["natural"="wetland"]; relation${ar}["natural"="wetland"];
    node${ar}["wetland"~"swamp|bog|marsh|mangrove|wet_meadow"]; way${ar}["wetland"~"swamp|bog|marsh|mangrove"];
    node${ar}["waterway"~"river|stream|canal|drain"]; way${ar}["waterway"~"river|stream|canal"];
    node${ar}["natural"="water"]; way${ar}["natural"="water"]; relation${ar}["natural"="water"];
    node${ar}["leisure"="nature_reserve"]; way${ar}["leisure"="nature_reserve"]; relation${ar}["leisure"="nature_reserve"];
    node${ar}["highway"~"path|footway|track"]; way${ar}["highway"~"path|footway|track"];
    node${ar}["tourism"~"camp_site|picnic_site"]; way${ar}["tourism"~"camp_site|picnic_site"];
    node${ar}["boundary"="protected_area"]; way${ar}["boundary"="protected_area"]; relation${ar}["boundary"="protected_area"];
  `

  if (intent === 'offgrid_public_land') return `
    relation${ar}["boundary"="national_park"]; way${ar}["boundary"="national_park"];
    relation${ar}["boundary"="protected_area"]; way${ar}["boundary"="protected_area"];
    relation${ar}["leisure"="nature_reserve"]; way${ar}["leisure"="nature_reserve"];
    node${ar}["tourism"="camp_site"]["backcountry"="yes"]; way${ar}["tourism"="camp_site"]["backcountry"="yes"];
    node${ar}["tourism"="camp_site"]; way${ar}["tourism"="camp_site"];
    node${ar}["natural"="water"]; way${ar}["natural"="water"]; relation${ar}["natural"="water"];
    node${ar}["highway"="track"]; way${ar}["highway"="track"];
    node${ar}["landuse"~"forest|meadow|grass"]; way${ar}["landuse"~"forest|meadow|grass"];
    node${ar}["natural"~"wood|forest|peak|ridge"]; way${ar}["natural"~"wood|forest"];
  `

  if (intent === 'terrain_intelligence') return `
    node${ar}["natural"~"peak|ridge|cliff|valley|gorge|canyon"]; way${ar}["natural"~"peak|ridge|cliff|valley"];
    node${ar}["natural"="water"]; way${ar}["natural"="water"]; relation${ar}["natural"="water"];
    node${ar}["waterway"~"river|stream|waterfall"]; way${ar}["waterway"~"river|stream|waterfall"];
    node${ar}["natural"="waterfall"]; way${ar}["natural"="waterfall"];
    node${ar}["highway"~"path|track"]; way${ar}["highway"~"path|track"];
    node${ar}["boundary"="protected_area"]; way${ar}["boundary"="protected_area"]; relation${ar}["boundary"="protected_area"];
    node${ar}["natural"~"wood|forest"]; way${ar}["natural"~"wood|forest"];
  `

  if (intent === 'hidden_gem') return `
    node${ar}["natural"="water"]; way${ar}["natural"="water"]; relation${ar}["natural"="water"];
    node${ar}["natural"="spring"]; way${ar}["natural"="spring"];
    node${ar}["waterway"~"stream|river"]; way${ar}["waterway"~"stream|river"];
    node${ar}["leisure"~"nature_reserve|park"]; way${ar}["leisure"~"nature_reserve|park"]; relation${ar}["leisure"~"nature_reserve"];
    node${ar}["boundary"="protected_area"]; way${ar}["boundary"="protected_area"]; relation${ar}["boundary"="protected_area"];
    node${ar}["tourism"~"camp_site|picnic_site"]; way${ar}["tourism"~"camp_site|picnic_site"];
    node${ar}["highway"="track"]; way${ar}["highway"="track"];
    node${ar}["natural"~"wood|forest|wetland"]; way${ar}["natural"~"wood|forest|wetland"];
  `

  if (intent === 'dog_family_water') return `
    node${ar}["natural"="water"]; way${ar}["natural"="water"]; relation${ar}["natural"="water"];
    node${ar}["water"~"lake|reservoir|pond|river"]; way${ar}["water"~"lake|reservoir|pond|river"];
    node${ar}["leisure"~"park|nature_reserve|swimming_area"]; way${ar}["leisure"~"park|nature_reserve|swimming_area"]; relation${ar}["leisure"~"park|nature_reserve"];
    node${ar}["dog"="yes"]; way${ar}["dog"="yes"];
    node${ar}["highway"~"path|footway|track"]; way${ar}["highway"~"path|footway|track"];
    node${ar}["tourism"~"camp_site|picnic_site"]; way${ar}["tourism"~"camp_site|picnic_site"];
    node${ar}["waterway"~"river|stream"]; way${ar}["waterway"~"river|stream"];
    node${ar}["boundary"="protected_area"]; way${ar}["boundary"="protected_area"]; relation${ar}["boundary"="protected_area"];
    node${ar}["natural"="spring"]; way${ar}["natural"="spring"];
  `

  if (intent === 'ranch_farm_land') return `
    node${ar}["landuse"~"farmland|meadow|ranch|grass"]; way${ar}["landuse"~"farmland|meadow|ranch|grass"]; relation${ar}["landuse"~"farmland|meadow"];
    node${ar}["natural"="wetland"]; way${ar}["natural"="wetland"]; relation${ar}["natural"="wetland"];
    node${ar}["natural"="water"]; way${ar}["natural"="water"]; relation${ar}["natural"="water"];
    node${ar}["waterway"~"river|stream"]; way${ar}["waterway"~"river|stream"];
    node${ar}["leisure"="nature_reserve"]; way${ar}["leisure"="nature_reserve"]; relation${ar}["leisure"="nature_reserve"];
    node${ar}["boundary"="protected_area"]; way${ar}["boundary"="protected_area"]; relation${ar}["boundary"="protected_area"];
    node${ar}["tourism"~"camp_site|guest_house"]; way${ar}["tourism"~"camp_site|guest_house"];
  `

  if (intent === 'hunting_wma' || intent === 'hunting_wildlife') return `
    node${ar}["natural"="wetland"]; way${ar}["natural"="wetland"]; relation${ar}["natural"="wetland"];
    node${ar}["leisure"="nature_reserve"]; way${ar}["leisure"="nature_reserve"]; relation${ar}["leisure"="nature_reserve"];
    node${ar}["boundary"="protected_area"]; way${ar}["boundary"="protected_area"]; relation${ar}["boundary"="protected_area"];
    node${ar}["natural"="water"]; way${ar}["natural"="water"]; relation${ar}["natural"="water"];
    node${ar}["waterway"~"river|stream"]; way${ar}["waterway"~"river|stream"];
    node${ar}["landuse"~"farmland|meadow"]; way${ar}["landuse"~"farmland|meadow"];
    node${ar}["highway"="track"]; way${ar}["highway"="track"];
  `

  if (intent === 'wildlife_habitat') return `
    node${ar}["natural"="wetland"]; way${ar}["natural"="wetland"]; relation${ar}["natural"="wetland"];
    node${ar}["leisure"~"nature_reserve|bird_hide"]; way${ar}["leisure"~"nature_reserve"]; relation${ar}["leisure"="nature_reserve"];
    node${ar}["boundary"="protected_area"]; way${ar}["boundary"="protected_area"]; relation${ar}["boundary"="protected_area"];
    node${ar}["natural"="water"]; way${ar}["natural"="water"]; relation${ar}["natural"="water"];
    node${ar}["waterway"~"river|stream|canal"]; way${ar}["waterway"~"river|stream|canal"];
    node${ar}["sport"="fishing"]; way${ar}["sport"="fishing"];
  `

  if (intent === 'public_water_recreation') return `
    node${ar}["natural"="water"]; way${ar}["natural"="water"]; relation${ar}["natural"="water"];
    node${ar}["natural"="waterfall"]; way${ar}["natural"="waterfall"];
    node${ar}["natural"="spring"]; way${ar}["natural"="spring"];
    node${ar}["leisure"~"swimming_area|fishing|park"]; way${ar}["leisure"~"swimming_area|fishing|park"]; relation${ar}["leisure"="park"];
    node${ar}["sport"~"swimming|fishing"]; way${ar}["sport"~"swimming|fishing"];
    node${ar}["tourism"~"camp_site|picnic_site"]; way${ar}["tourism"~"camp_site|picnic_site"];
    node${ar}["waterway"~"river|stream"]; way${ar}["waterway"~"river|stream"];
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

// ── Scoring ───────────────────────────────────────────────────────────
function scoreFeature(tags: Record<string, string>, intent: string, distance_m: number, tagCount: number) {
  const signals: string[] = []
  let score = 48
  const add = (s: string, pts: number) => { signals.push(s); score += pts }

  // Water signals
  if (tags.natural === 'water' || tags.water) add('water', 16)
  if (tags.natural === 'spring') add('spring', 24)
  if (tags.natural === 'waterfall') add('waterfall', 22)
  if (tags.natural === 'wetland') add('wetland', 20)
  if (tags.wetland === 'swamp' || tags.wetland === 'marsh') add('swamp-marsh', 18)
  if (tags.waterway) add('waterway', 12)
  if (tags.swimming === 'yes' || tags.sport === 'swimming' || tags.leisure === 'swimming_area') add('swimming', 18)
  if (tags.sport === 'fishing' || tags.leisure === 'fishing') add('fishing', 10)

  // Terrain signals
  if (tags.natural === 'peak' || tags.natural === 'ridge') add('high-terrain', 14)
  if (tags.natural === 'cliff' || tags.natural === 'valley') add('dramatic-terrain', 16)

  // Access signals
  if (tags.highway && /path|footway|track/.test(tags.highway)) add('trail-access', 12)
  if (tags.leisure === 'park') add('public-park', 14)
  if (tags.leisure === 'nature_reserve') add('nature-reserve', 18)
  if (tags.boundary === 'protected_area') add('protected-area', 18)
  if (tags.boundary === 'national_park') add('national-park', 22)
  if (tags.tourism === 'camp_site') add('campsite', 12)
  if (tags.backcountry === 'yes') add('backcountry', 14)
  if (tags.access === 'yes' || tags.access === 'permissive') add('open-access', 8)
  if (tags.dog === 'yes') add('dog-friendly', 14)
  if (tags.landuse === 'farmland' || tags.landuse === 'meadow') add('rural-land', 10)
  if (tags.historic) add('historic', 16)

  // ── LOWKEY SCORE — inverse of tag density ────────────────────────────
  // Fewer OSM tags = less documented = more hidden gem potential
  // tagCount is total tags on this feature
  if (tagCount <= 3 && signals.some(s => ['water','spring','wetland','waterway','nature-reserve','protected-area'].includes(s))) {
    add('lowkey-undocumented', 12)
  } else if (tagCount <= 6 && signals.some(s => ['water','spring','wetland'].includes(s))) {
    add('lowkey-sparse', 6)
  }
  // No tourism tag + has water = likely undiscovered
  if (!tags.tourism && !tags.amenity && signals.includes('water')) add('no-tourism-tag', 8)

  // Intent boosters
  if (intent === 'springs_swimming' && (signals.includes('spring') || signals.includes('swimming'))) score += 16
  if (intent === 'springs_swimming' && signals.includes('waterfall')) score += 14
  if (intent === 'cypress_swamp_bayou' && (signals.includes('swamp-marsh') || signals.includes('wetland'))) score += 16
  if (intent === 'offgrid_public_land' && signals.includes('national-park')) score += 16
  if (intent === 'offgrid_public_land' && signals.includes('backcountry')) score += 14
  if (intent === 'offgrid_public_land' && signals.includes('protected-area')) score += 10
  if (intent === 'terrain_intelligence' && signals.includes('dramatic-terrain')) score += 16
  if (intent === 'terrain_intelligence' && signals.includes('high-terrain')) score += 12
  if (intent === 'terrain_intelligence' && signals.includes('waterway')) score += 8
  if (intent === 'hidden_gem' && signals.includes('lowkey-undocumented')) score += 16
  if (intent === 'hidden_gem' && signals.includes('no-tourism-tag')) score += 12
  if (intent === 'hidden_gem' && signals.includes('spring')) score += 14
  if (intent === 'dog_family_water' && signals.includes('water')) score += 14
  if (intent === 'dog_family_water' && signals.includes('dog-friendly')) score += 12
  if (intent === 'dog_family_water' && signals.includes('spring')) score += 10
  if (intent === 'ranch_farm_land' && signals.includes('rural-land')) score += 14
  if (intent === 'ranch_farm_land' && signals.includes('wetland')) score += 10
  if (intent === 'hunting_wma' && signals.includes('wetland')) score += 12
  if (intent === 'hunting_wildlife' && signals.includes('wetland')) score += 10
  if (intent === 'public_water_recreation' && signals.includes('water')) score += 10
  if (intent === 'public_water_recreation' && signals.includes('swimming')) score += 12
  if (intent === 'trails_public_land' && signals.includes('trail-access')) score += 10
  if (intent === 'historical_location' && signals.includes('historic')) score += 12
  if (intent === 'wildlife_habitat' && signals.includes('wetland')) score += 12

  // Distance penalty
  score -= Math.min(15, Math.floor(distance_m / 9000))

  return { score: Math.max(35, Math.min(98, score)), signals }
}

function buildLayers(signals: string[], intent: string): string[] {
  return Array.from(new Set([
    'terrain', 'topo',
    signals.some(s => ['water','spring','waterfall','wetland','swamp-marsh','waterway','swimming','fishing'].includes(s)) ? 'hydro' : '',
    signals.some(s => ['wetland','swamp-marsh'].includes(s)) ? 'ndvi' : '',
    signals.includes('historic') ? 'lidar' : '',
    ['hunting_wma','hunting_wildlife','ranch_farm_land'].includes(intent) ? 'sar' : '',
    signals.includes('dramatic-terrain') || signals.includes('high-terrain') ? 'lidar' : '',
  ].filter(Boolean)))
}

function buildBrief(intent: string, signals: string[], name: string): string[] {
  const lines: string[] = []
  if (intent === 'springs_swimming') {
    lines.push(signals.includes('spring') ? 'Spring-fed water source detected.' : 'Water access candidate.')
    lines.push(signals.includes('swimming') ? 'Tagged for swimming access.' : 'Verify swimming access on-site.')
    lines.push('Check for seasonal flow — Texas springs vary by rainfall and aquifer levels.')
  } else if (intent === 'cypress_swamp_bayou') {
    lines.push('Wetland or bayou corridor candidate.')
    lines.push('Look for cypress and tupelo canopy on NDVI overlay in Viewer.')
    lines.push('Verify boat/kayak access and seasonal water levels before visiting.')
  } else if (intent === 'offgrid_public_land') {
    lines.push(signals.includes('national-park') ? 'National Park or federal protected land.' : 'Remote public land candidate.')
    lines.push(signals.includes('backcountry') ? 'Backcountry camping tagged.' : 'Verify dispersed camping rules.')
    lines.push('Check fire restrictions, road conditions, and permit requirements.')
  } else if (intent === 'terrain_intelligence') {
    lines.push('Significant terrain feature — elevation change or dramatic relief.')
    lines.push('Open in Viewer and run terrain profile tool for elevation cross-section.')
    lines.push('Use LiDAR layer to reveal hidden topographic detail.')
  } else if (intent === 'hidden_gem') {
    lines.push(signals.includes('lowkey-undocumented') ? 'Low OSM documentation — likely undiscovered by most visitors.' : 'Hidden candidate with limited public exposure.')
    lines.push(signals.includes('no-tourism-tag') ? 'No commercial tourism infrastructure detected.' : 'Minimal tourism footprint.')
    lines.push('Verify access and ownership before visiting. These spots stay hidden for a reason.')
  } else if (intent === 'dog_family_water') {
    lines.push('Family and dog-compatible water access candidate.')
    lines.push(signals.includes('dog-friendly') ? 'Explicitly tagged dog-friendly.' : 'Verify on-leash rules and dog swimming policy.')
    lines.push('Check for shallow entry points and shade coverage.')
  } else if (intent === 'ranch_farm_land') {
    lines.push('Rural land candidate — farmland, meadow, or wetland corridor.')
    lines.push('May be private. Verify ownership and access before entry.')
    if (signals.includes('wetland')) lines.push('Wetland features present — waterfowl habitat likely.')
  } else if (intent === 'hunting_wma') {
    lines.push('TPWD Wildlife Management Area or hunting habitat candidate.')
    lines.push('Verify current TPWD season, permit requirements, and access rules at tpwd.texas.gov.')
    lines.push('WMAs require Annual Public Hunting Permit or specific WMA permit.')
  } else if (intent === 'hunting_wildlife') {
    lines.push('Wildlife habitat or hunting area candidate.')
    lines.push('Verify TPWD season dates, species rules, and current closures before field use.')
  } else {
    lines.push('Live ASTRA environmental discovery candidate.')
    lines.push('Verify access, ownership, and current conditions before visiting.')
  }
  lines.push('Open in Viewer for LiDAR, NDVI, terrain profile, SAR, and AOI analysis.')
  return lines
}

// ── TPWD WMA fetch ────────────────────────────────────────────────────
async function fetchTPWDWMAs(center: { lat: number; lng: number }, radiusM: number): Promise<Candidate[]> {
  const radiusDeg = radiusM / 111320
  const bbox = `${center.lng - radiusDeg},${center.lat - radiusDeg},${center.lng + radiusDeg},${center.lat + radiusDeg}`
  const url = `${TPWD_WMA_URL}?where=Active%3D'Yes'&outFields=WMA,LoName,County1,County2&geometry=${encodeURIComponent(bbox)}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnGeometry=true&outSR=4326&f=json&resultRecordCount=20`

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    const features = data.features || []
    return features.map((f: any): Candidate => {
      const lat = f.geometry?.y
      const lng = f.geometry?.x
      const attrs = f.attributes || {}
      const name = attrs.WMA || attrs.LoName || 'Texas WMA'
      const county = [attrs.County1, attrs.County2].filter(c => c && c.trim()).join(', ')
      const dist = meters(center, { lat, lng })
      return {
        id: `tpwd-wma-${name.replace(/\s+/g, '-').toLowerCase()}`,
        name,
        lat: Number(lat.toFixed(5)),
        lng: Number(lng.toFixed(5)),
        type: 'TPWD Wildlife Management Area',
        score: 78,
        reason: `Official TPWD WMA — ${county ? county + ' County' : 'Texas'} — ${Math.round(dist / 1000)}km from search center. Public hunting with Annual Public Hunting Permit.`,
        layers: ['terrain', 'topo', 'hydro', 'ndvi', 'sar'],
        signals: ['tpwd-wma', 'protected-area', 'hunting-access', 'wildlife'],
        source_label: 'TPWD',
        brief: [
          `Official Texas WMA: ${name}${county ? ' — ' + county + ' County' : ''}.`,
          'Requires Annual Public Hunting Permit or WMA-specific permit. Check tpwd.texas.gov for current rules.',
          'Open in Viewer for terrain, NDVI vegetation density, and SAR backscatter analysis.',
        ],
        distance_m: dist,
      }
    }).filter((c: Candidate) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
  } catch { return [] }
}

// ── OSM discover ──────────────────────────────────────────────────────
async function discoverOSM(query: string, intent: string, center: { lat: number; lng: number }): Promise<Candidate[]> {
  const radius = ['hunting_wma', 'hunting_wildlife', 'offgrid_public_land', 'ranch_farm_land', 'hidden_gem', 'terrain_intelligence'].includes(intent) ? 150000 : 80000

  const body = `[out:json][timeout:25];\n(\n${filtersFor(intent, radius, center.lat, center.lng)}\n);\nout center tags 60;`

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
    next: { revalidate: 21600 },
  })
  if (!res.ok) throw new Error('Overpass unavailable')
  const data = await res.json()
  const elements = Array.isArray(data.elements) ? data.elements : []

  return elements.map((el: any, i: number): Candidate | null => {
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    const tags = el.tags || {}
    const tagCount = Object.keys(tags).length
    const distance_m = meters(center, { lat, lng })
    const { score, signals } = scoreFeature(tags, intent, distance_m, tagCount)
    const name = tags.name || tags['gnis:name'] || tags.ref || `${intent.replaceAll('_', ' ')} site ${i + 1}`

    return {
      id: `osm-${el.type}-${el.id}`,
      name,
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      type: signals.slice(0, 3).join(' + ') || 'environmental feature',
      score,
      reason: `ASTRA ranked via ${signals.slice(0, 4).join(', ') || 'environmental'} signals — ${Math.round(distance_m / 1000)}km from center.`,
      layers: buildLayers(signals, intent),
      signals, tags, distance_m,
      source_label: 'OSM',
      brief: buildBrief(intent, signals, name),
    }
  }).filter(Boolean) as Candidate[]
}

function fallbackCandidates(): Candidate[] {
  return [{
    id: 'astra-fallback',
    name: 'Add a place name for live results',
    lat: 33.1972, lng: -96.6398,
    type: 'fallback', score: 55,
    reason: 'Try: "hidden swimming holes near Austin TX" or "public hunting land East Texas" or "dog-friendly lakes near Dallas".',
    layers: ['terrain', 'topo', 'hydro'],
    signals: ['fallback'],
    brief: [
      'Add a location like "near Houston" or "in East Texas" or "Texas Hill Country" for live ASTRA results.',
      'Try specific intent: "spring-fed swimming holes", "cypress swamps", "remote public land with water".',
    ],
  }]
}

// ── Main handler ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const query = String(body.query || '')
  const intent = classifyIntent(query)

  const geo = await geocodeQuery(query).catch(() => null)
  const center = geo ?? fallbackCenter(query)

  let osmCandidates: Candidate[] = []
  let wmaCandiates: Candidate[] = []
  let source = 'fallback'

  // Parallel fetch — OSM + TPWD WMA (if hunting/wildlife intent)
  const useWMA = ['hunting_wma', 'hunting_wildlife', 'wildlife_habitat', 'hidden_gem', 'offgrid_public_land'].includes(intent)

  await Promise.allSettled([
    discoverOSM(query, intent, center).then(r => { osmCandidates = r; source = 'openstreetmap-overpass' }).catch(() => {}),
    useWMA ? fetchTPWDWMAs(center, 200000).then(r => { wmaCandiates = r }).catch(() => {}) : Promise.resolve(),
  ])

  // Merge and deduplicate by proximity (>500m apart)
  const merged = [...wmaCandiates, ...osmCandidates]
  const deduped: Candidate[] = []
  for (const c of merged) {
    const tooClose = deduped.some(d => meters(c, d) < 500)
    if (!tooClose) deduped.push(c)
  }

  let candidates = deduped.sort((a, b) => b.score - a.score).slice(0, 8)
  if (!candidates.length) { candidates = fallbackCandidates(); source = 'fallback' }

  const wmaCount = candidates.filter(c => c.source_label === 'TPWD').length
  const osmCount = candidates.filter(c => c.source_label === 'OSM').length

  const synthMap: Record<string, string> = {
    springs_swimming: `ASTRA found ${candidates.length} spring and swimming hole candidates. Ranked by spring tags, swimming access, waterfall, and water quality signals.`,
    cypress_swamp_bayou: `ASTRA found ${candidates.length} cypress swamp, bayou, and wetland corridor candidates. Use NDVI overlay in Viewer to identify tree canopy density.`,
    offgrid_public_land: `ASTRA found ${candidates.length} remote public land candidates${wmaCount ? ` including ${wmaCount} TPWD WMAs` : ''}. Ranked by protection status, water access, and remoteness.`,
    terrain_intelligence: `ASTRA found ${candidates.length} significant terrain candidates. Open in Viewer and run terrain profile for elevation cross-sections.`,
    hidden_gem: `ASTRA found ${candidates.length} low-documentation candidates — ranked by inverse OSM tag density, water presence, and no-tourism signals. These are the ones most people miss.`,
    dog_family_water: `ASTRA found ${candidates.length} family and dog-compatible water candidates. Ranked by water access, dog-friendly tags, trail access, and public land status.`,
    ranch_farm_land: `ASTRA found ${candidates.length} rural land candidates — farmland, wetlands, meadows. Verify ownership before entry.`,
    hunting_wma: `ASTRA found ${candidates.length} hunting candidates${wmaCount ? ` — ${wmaCount} official TPWD WMAs` : ''}. All WMAs require Annual Public Hunting Permit.`,
    hunting_wildlife: `ASTRA found ${candidates.length} wildlife habitat candidates${wmaCount ? ` including ${wmaCount} TPWD WMAs` : ''}. Verify TPWD season rules before field use.`,
    wildlife_habitat: `ASTRA found ${candidates.length} wildlife habitat candidates${wmaCount ? ` including ${wmaCount} TPWD WMAs` : ''}.`,
    public_water_recreation: `ASTRA found ${candidates.length} public water recreation candidates ranked by water type, swimming access, and public land status.`,
    trails_public_land: `ASTRA found ${candidates.length} trail and public land candidates.`,
  }

  return NextResponse.json({
    ok: true,
    astra: {
      mode: 'ASTRA_DISCOVERY_GLOBE',
      source: wmaCount > 0 ? `openstreetmap-overpass + TPWD (${wmaCount} WMAs)` : source,
      intent,
      query,
      center,
      recommended_layers: Array.from(new Set(candidates.flatMap(c => c.layers))),
      synthesis: source === 'fallback'
        ? 'Add a place name like "near Dallas TX" or "in East Texas" for live ASTRA results.'
        : synthMap[intent] || `ASTRA found ${candidates.length} candidates ranked by environmental signals.`,
      candidates,
    },
  })
}
