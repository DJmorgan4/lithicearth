import { NextRequest, NextResponse } from 'next/server'

const ASTRA_CORE = 'https://astarte-works.vercel.app/api/astra/core'

export async function POST(req: NextRequest) {
  try {
    const { lat, lng, layers, readout } = await req.json()
    const query = `Analyze this location for environmental and terrain intelligence:
Coordinates: ${lat}°N, ${lng}°E
Active layers: ${layers?.filter((l: any) => l.active).map((l: any) => l.label).join(', ') || 'terrain, satellite'}
Readout: elevation ${readout?.elevation ?? 'unknown'}m, NDVI ${readout?.ndvi ?? 'unknown'}

Provide a concise ASTRA field brief covering: terrain character, water features, environmental conditions, access considerations, and any notable signals. 3-4 sentences.`

    const res = await fetch(ASTRA_CORE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, source: 'lithicearth', domain: 'geospatial' }),
      signal: AbortSignal.timeout(20000),
    })
    const data = await res.json()
    return NextResponse.json({ narration: data.response })
  } catch (err: any) {
    return NextResponse.json({ narration: 'ASTRA Core unavailable.' }, { status: 503 })
  }
}
