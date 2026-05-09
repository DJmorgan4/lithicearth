import { NextRequest, NextResponse } from 'next/server'

// Cache token in memory for its lifetime
let cachedToken: { token: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30000) {
    return cachedToken.token
  }
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/cdse/token`)
  const data = await res.json()
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  }
  return cachedToken.token
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const wmsUrl = searchParams.get('url')
  if (!wmsUrl) return NextResponse.json({ error: 'url required' }, { status: 400 })

  try {
    const token = await getToken()
    const res = await fetch(wmsUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    })
    const buf = await res.arrayBuffer()
    return new NextResponse(buf, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'image/png',
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
