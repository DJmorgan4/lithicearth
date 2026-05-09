import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.CDSE_CLIENT_ID
  const clientSecret = process.env.CDSE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'CDSE not configured' }, { status: 500 })
  }
  try {
    const res = await fetch(
      'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }),
        signal: AbortSignal.timeout(10000),
      }
    )
    const data = await res.json()
    return NextResponse.json({
      access_token: data.access_token,
      expires_in: data.expires_in ?? 600,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
