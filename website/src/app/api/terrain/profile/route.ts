import { NextRequest, NextResponse } from 'next/server'
import { PNG } from 'pngjs'

type ProfilePoint = {
  lat: number
  lng: number
  distance: number
  elevation: number
}

function clampLat(lat: number) {
  return Math.max(-85, Math.min(85, lat))
}

function wrapLng(lng: number) {
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

function lonLatToTile(lng: number, lat: number, z: number) {
  const latRad = lat * Math.PI / 180
  const n = 2 ** z
  const x = Math.floor(((lng + 180) / 360) * n)
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  )
  return { x, y }
}

function lonLatToPixel(lng: number, lat: number, z: number) {
  const latRad = lat * Math.PI / 180
  const n = 2 ** z
  const px = ((lng + 180) / 360) * n * 256
  const py =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    n *
    256

  return {
    pixelX: Math.floor(px % 256),
    pixelY: Math.floor(py % 256),
  }
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * R * Math.asin(Math.sqrt(h))
}

async function sampleTerrainRGB(lat: number, lng: number, z = 12) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN
  if (!token) return null

  const safeLat = clampLat(lat)
  const safeLng = wrapLng(lng)

  const { x, y } = lonLatToTile(safeLng, safeLat, z)
  const { pixelX, pixelY } = lonLatToPixel(safeLng, safeLat, z)

  const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}.pngraw?access_token=${token}`

  const res = await fetch(url, {
    cache: 'force-cache',
    next: { revalidate: 60 * 60 * 24 },
  })

  if (!res.ok) return null

  const arrayBuffer = await res.arrayBuffer()
  const png = PNG.sync.read(Buffer.from(arrayBuffer))

  const x = Math.max(0, Math.min(255, pixelX))
  const y = Math.max(0, Math.min(255, pixelY))
  const idx = (png.width * y + x) * 4

  const r = png.data[idx]
  const g = png.data[idx + 1]
  const b = png.data[idx + 2]

  // Mapbox Terrain-RGB elevation formula:
  // height = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
  return -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1)
}

function syntheticElevation(base: number, i: number) {
  return (
    base +
    Math.sin(i / 2.8) * 8 +
    Math.cos(i / 3.7) * 5
  )
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)

  const startLat = Number(url.searchParams.get('startLat'))
  const startLng = Number(url.searchParams.get('startLng'))
  const endLat = Number(url.searchParams.get('endLat'))
  const endLng = Number(url.searchParams.get('endLng'))
  const samples = Math.min(Number(url.searchParams.get('samples') || 32), 96)

  if (
    !Number.isFinite(startLat) ||
    !Number.isFinite(startLng) ||
    !Number.isFinite(endLat) ||
    !Number.isFinite(endLng)
  ) {
    return NextResponse.json({ error: 'Invalid terrain profile coordinates' }, { status: 400 })
  }

  const start = { lat: clampLat(startLat), lng: wrapLng(startLng) }
  const end = { lat: clampLat(endLat), lng: wrapLng(endLng) }
  const totalDistance = haversineMeters(start, end)

  const base = 120
  const profile: ProfilePoint[] = []

  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const lat = start.lat + (end.lat - start.lat) * t
    const lng = start.lng + (end.lng - start.lng) * t

    const sampled = await sampleTerrainRGB(lat, lng)
    const elevation = sampled ?? syntheticElevation(base, i)

    profile.push({
      lat: Math.round(lat * 100000) / 100000,
      lng: Math.round(lng * 100000) / 100000,
      distance: Math.round(totalDistance * t),
      elevation: Math.round(elevation * 10) / 10,
    })
  }

  const elevations = profile.map(p => p.elevation)
  const min = Math.min(...elevations)
  const max = Math.max(...elevations)

  return NextResponse.json({
    source: process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN
      ? 'mapbox-terrain-rgb-fallback'
      : 'synthetic-fallback',
    distance_m: Math.round(totalDistance),
    sample_count: profile.length,
    min_elevation_m: min,
    max_elevation_m: max,
    relief_m: Math.round((max - min) * 10) / 10,
    profile,
  })
}
