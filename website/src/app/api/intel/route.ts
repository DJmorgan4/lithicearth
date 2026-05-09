import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  }

  const engineUrl = process.env.GEO_API_URL || 'http://127.0.0.1:8000'

  try {
    const res = await fetch(`${engineUrl}/analyze?lat=${lat}&lng=${lng}`, { signal: AbortSignal.timeout(20000) })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Engine offline', score: null, confidence: null, insights: [], layers: {} }, { status: 503 })
  }
}
