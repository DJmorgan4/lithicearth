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

  if (text.includes('crane') || text.includes('hunting') || text.includes('wma')) {
    return 'texas_hunting'
  }

  if (text.includes('dog') || text.includes('lake') || text.includes('water') || text.includes('public land')) {
    return 'public_water_recreation'
  }

  if (text.includes('historic') || text.includes('archaeolog') || text.includes('earthwork') || text.includes('mound')) {
    return 'historical_location'
  }

  if (text.includes('wildlife') || text.includes('habitat') || text.includes('wetland')) {
    return 'wildlife_habitat'
  }

  return 'general_discovery'
}

function candidatesFor(intent: string): Candidate[] {
  if (intent === 'texas_hunting') {
    return [
      {
        id: 'tx-crane-panhandle-playa',
        name: 'Texas Panhandle Playa-Wetland Corridor',
        lat: 34.872,
        lng: -101.704,
        type: 'Sandhill Crane / Wetland Search Zone',
        score: 91,
        reason: 'High-probability crane habitat pattern: playa wetlands, agricultural fields, open visibility, public-land screening required.',
        layers: ['wetlands', 'hydro', 'terrain', 'sar', 'ndvi'],
        brief: [
          'Verify current TPWD season, county, legal method, and access before field use.',
          'Use wetland + hydrology + NDVI overlays to locate active feeding and roosting structure.',
          'Viewer should inspect nearby access, elevation, cover, and water permanence.'
        ],
      },
      {
        id: 'tx-crane-south-plains',
        name: 'South Plains Wetland-Agricultural Interface',
        lat: 33.585,
        lng: -102.368,
        type: 'Crane Recon Candidate',
        score: 84,
        reason: 'Open agricultural matrix with intermittent water features and strong migratory suitability.',
        layers: ['wetlands', 'hydro', 'ndvi', 'topo'],
        brief: [
          'Use this as a discovery candidate, not a legal hunting recommendation.',
          'Check WMA boundaries and current public access.',
          'Prioritize dawn/dusk flight corridors and water proximity.'
        ],
      },
    ]
  }

  if (intent === 'public_water_recreation') {
    return [
      {
        id: 'dog-lake-hidden-public-1',
        name: 'Low-Key Public Water / Trail Candidate',
        lat: 33.289,
        lng: -96.579,
        type: 'Dog-Friendly Public Water Search',
        score: 88,
        reason: 'Water body near public-access landscape; good candidate for quiet dog-friendly recon with trail/topo screening.',
        layers: ['hydro', 'terrain', 'ndvi', 'topo', 'lidar'],
        brief: [
          'Check leash rules and local access before travel.',
          'Use terrain profile for slope comfort and heat exposure.',
          'Open in viewer for LiDAR, topo, hydrology, and trail-like access screening.'
        ],
      },
      {
        id: 'dog-lake-hidden-public-2',
        name: 'Secluded Waterbody Recon Zone',
        lat: 32.926,
        lng: -96.343,
        type: 'Public Land + Water Candidate',
        score: 81,
        reason: 'Hydrology + vegetation pattern suggests possible scenic water access with lower urban density.',
        layers: ['hydro', 'ndvi', 'terrain', 'satellite'],
        brief: [
          'Look for parking, shade, access roads, and dog restrictions.',
          'Use NDVI and satellite imagery to evaluate shoreline quality.',
          'Avoid private land unless access is confirmed.'
        ],
      },
    ]
  }

  if (intent === 'historical_location') {
    return [
      {
        id: 'historic-river-terrace-1',
        name: 'Historic River Terrace Recon Candidate',
        lat: 33.164,
        lng: -96.712,
        type: 'Historical / Archaeological Terrain Candidate',
        score: 86,
        reason: 'River-terrace terrain pattern suitable for historical occupation screening and LiDAR microtopography.',
        layers: ['lidar', 'terrain', 'hydro', 'geology', 'topo'],
        brief: [
          'Use LiDAR and hillshade to inspect terraces, mounds, old paths, and drainage edges.',
          'Respect site protection laws and private property boundaries.',
          'Open in viewer for AOI polygon scan and terrain profile.'
        ],
      },
    ]
  }

  if (intent === 'wildlife_habitat') {
    return [
      {
        id: 'wildlife-wetland-edge-1',
        name: 'Wetland Edge Wildlife Habitat Candidate',
        lat: 33.739,
        lng: -96.615,
        type: 'Wildlife Habitat Recon',
        score: 83,
        reason: 'Wetland-edge and vegetation-signature candidate for wildlife movement and habitat screening.',
        layers: ['wetlands', 'hydro', 'ndvi', 'sar', 'terrain'],
        brief: [
          'Good candidate for habitat mapping and low-impact observation.',
          'Use NDVI and hydrology layers to understand food/water structure.',
          'Check public access and seasonal closures.'
        ],
      },
    ]
  }

  return [
    {
      id: 'general-astra-recon',
      name: 'ASTRA General Recon Candidate',
      lat: 33.17429,
      lng: -96.61903,
      type: 'General Spatial Intelligence',
      score: 72,
      reason: 'Default ASTRA geospatial candidate. Refine query with public land, wildlife, historical, water, or hunting intent.',
      layers: ['terrain', 'hydro', 'ndvi', 'lidar'],
      brief: [
        'Ask ASTRA for a specific mission.',
        'Example: find quiet public lakes for dogs near McKinney.',
        'Example: find historical terrain near old river corridors.'
      ],
    },
  ]
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const query = String(body.query || '')
  const intent = classifyIntent(query)
  const candidates = candidatesFor(intent)

  const center = candidates[0]
    ? { lat: candidates[0].lat, lng: candidates[0].lng }
    : { lat: 33.17429, lng: -96.61903 }

  return NextResponse.json({
    ok: true,
    astra: {
      mode: 'ASTRA_DISCOVERY_GLOBE',
      intent,
      query,
      center,
      recommended_layers: Array.from(new Set(candidates.flatMap(c => c.layers))),
      synthesis:
        intent === 'texas_hunting'
          ? 'ASTRA identified wetland/agricultural crane habitat patterns. Legal access, season, bag limits, and TPWD rules must be verified before field action.'
          : intent === 'public_water_recreation'
            ? 'ASTRA identified public-water recreation candidates based on hydrology, terrain comfort, vegetation quality, and low-key access logic.'
            : intent === 'historical_location'
              ? 'ASTRA identified historical terrain candidates using hydrology, terrace, LiDAR, and geology logic.'
              : 'ASTRA generated spatial reconnaissance candidates from the query.',
      candidates,
    },
  })
}
