import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')
  const radius = searchParams.get('radius') || '500'

  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat/lng required' }, { status: 400 })
  }

  const engineUrl = process.env.GEO_API_URL || 'http://127.0.0.1:8020'

  try {
    const res = await fetch(
      `${engineUrl}/scan?lat=${lat}&lng=${lng}&radius_m=${radius}`,
      { signal: AbortSignal.timeout(30000) }
    )
    if (!res.ok) throw new Error(`engine ${res.status}`)
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 503 })
  }
}
