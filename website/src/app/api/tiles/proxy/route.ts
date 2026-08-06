// app/api/tiles/proxy/route.ts
//
// Allowlisted passthrough for third-party historical map tiles.
// Reasons this exists rather than hotlinking from the browser:
//   1. Map collections have no SLA and some block cross-origin hotlinking.
//   2. Their origin sees your users' IPs and Referer if you don't proxy.
//   3. Edge caching turns a rate-limited origin into something usable.
//
// Placeholders stay OUTSIDE the encoded src so Leaflet fills z/x/y and
// this route substitutes them into the template.
//   /api/tiles/proxy?src=<encoded template>&z={z}&x={x}&y={y}

import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Add hosts as you register maps. Anything not listed is rejected —
// this endpoint must never become an open relay.
const ALLOWED_HOSTS = new Set([
  'davidrumsey.georeferencer.com',
  'maps.georeferencer.com',
  'allmaps.xyz',
  'tiles.allmaps.org',
  'maps.nypl.org',
  'mapwarper.net',
  'prod-tnm.s3.amazonaws.com',
  'ngmdb.usgs.gov',
  'basemap.nationalmap.gov',
  'tile.loc.gov',
])

const TILE_TTL = 60 * 60 * 24 * 30 // 30 days — old maps do not change

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const src = params.get('src')
  const z = params.get('z')
  const x = params.get('x')
  const y = params.get('y')

  if (!src) {
    return new Response('Missing src', { status: 400 })
  }

  let target: URL
  try {
    const filled = src
      .replace('{z}', z ?? '')
      .replace('{x}', x ?? '')
      .replace('{y}', y ?? '')
      .replace('{-y}', y ?? '')
    target = new URL(filled)
  } catch {
    return new Response('Malformed src', { status: 400 })
  }

  if (target.protocol !== 'https:') {
    return new Response('https only', { status: 400 })
  }

  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return new Response(`Host not allowlisted: ${target.hostname}`, { status: 403 })
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        // Identify yourself. Several collections will throttle or block
        // anonymous scraping but are fine with a named client.
        'User-Agent': 'LithicEarth/1.0 (+https://lithicearth.com)',
        Accept: 'image/avif,image/webp,image/png,image/*;q=0.8',
      },
      next: { revalidate: TILE_TTL },
    })

    if (!upstream.ok) {
      return new Response(null, { status: upstream.status })
    }

    const body = await upstream.arrayBuffer()

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'image/png',
        'Cache-Control': `public, max-age=${TILE_TTL}, s-maxage=${TILE_TTL}, immutable`,
        'X-Tile-Origin': target.hostname,
      },
    })
  } catch (err) {
    console.error('[tiles/proxy] upstream failed', target.hostname, err)
    return new Response('Upstream fetch failed', { status: 502 })
  }
}
