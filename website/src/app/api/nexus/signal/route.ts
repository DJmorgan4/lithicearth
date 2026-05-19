import { NextRequest, NextResponse } from 'next/server'

const ENGINE = process.env.GEO_API_URL || 'https://lithicearth-production.up.railway.app'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const W = { terrain: 0.35, ndvi: 0.25, sar: 0.20, muon: 0.15, thermal: 0.05 }

function clamp(v: number, min = 0, max = 1) { return Math.max(min, Math.min(max, v)) }

function ndviSignal(ndvi: number | null): number {
  if (ndvi === null) return 0.5
  if (ndvi > 0.6) return 0.2
  if (ndvi > 0.4) return 0.35
  if (ndvi > 0.2) return 0.55
  if (ndvi > 0.0) return 0.70
  return 0.85
}

function terrainSignal(scan: any): number {
  const candidates = scan?.candidates || []
  if (!candidates.length) return 0.3
  return clamp(candidates[0].score || 0.5)
}

function sarSignal(sar: any): number {
  if (!sar || sar.status !== 'found') return 0.4
  if (sar.value !== null) {
    const db = sar.value
    if (db > -5 || db < -20) return 0.85
    if (db > -8 || db < -18) return 0.65
    return 0.45
  }
  return 0.5
}

function muonSignal(muon: any): number {
  if (!muon?.valid) return 0.5
  const ratio = muon.flux_m2_min / muon.void_threshold_m2_min
  if (ratio > 1.1) return 0.85
  if (ratio > 1.0) return 0.70
  if (ratio > 0.9) return 0.50
  return 0.30
}

async function storeReading(lat: number, lng: number, nexusScore: number) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return
  try {
    const existRes = await fetch(
      `${SUPABASE_URL}/rest/v1/stratum_sites?latitude=gte.${lat - 0.001}&latitude=lte.${lat + 0.001}&longitude=gte.${lng - 0.001}&longitude=lte.${lng + 0.001}&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
    const existing = await existRes.json()
    const payload = {
      name: `NEXUS-${lat.toFixed(4)},${lng.toFixed(4)}`,
      latitude: lat, longitude: lng,
      source: 'nexus', site_type: 'signal', status: 'active',
      ceto_score: Math.round(nexusScore * 100),
      ceto_tier: nexusScore > 0.75 ? 'High' : nexusScore > 0.5 ? 'Moderate' : 'Low',
      updated_at: new Date().toISOString(),
    }
    if (existing?.length > 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/stratum_sites?id=eq.${existing[0].id}`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(payload),
      })
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/stratum_sites`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(payload),
      })
    }
  } catch {}
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') || '')
  const lng = parseFloat(searchParams.get('lng') || '')

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  }

  const [intelRes, scanRes] = await Promise.allSettled([
    fetch(`${ENGINE}/analyze?lat=${lat}&lng=${lng}`, { signal: AbortSignal.timeout(25000) }),
    fetch(`${ENGINE}/scan?lat=${lat}&lng=${lng}&radius_m=500`, { signal: AbortSignal.timeout(30000) }),
  ])

  const intel = intelRes.status === 'fulfilled' && intelRes.value.ok ? await intelRes.value.json() : null
  const scan = scanRes.status === 'fulfilled' && scanRes.value.ok ? await scanRes.value.json() : null
  const m = intel?.measurements || {}

  const signals = {
    terrain: terrainSignal(scan),
    ndvi:    ndviSignal(m.ndvi?.value ?? null),
    sar:     sarSignal(m.sar),
    muon:    muonSignal(scan?.muon_baseline),
    thermal: 0.5,
  }

  const nexusScore = clamp(
    signals.terrain * W.terrain +
    signals.ndvi    * W.ndvi +
    signals.sar     * W.sar +
    signals.muon    * W.muon +
    signals.thermal * W.thermal
  )

  const tier = nexusScore > 0.72 ? 'ANOMALY' : nexusScore > 0.55 ? 'ELEVATED' : nexusScore > 0.38 ? 'NOMINAL' : 'CLEAR'

  const sources = [
    intel ? `S2 NDVI ${m.ndvi?.value?.toFixed(3) ?? 'N/A'} · ${m.ndvi?.acquired?.slice(0,10) ?? '—'}` : null,
    intel ? `S1 SAR ${m.sar?.value !== null ? m.sar?.value + 'dB' : 'scene confirmed'} · ${m.sar?.acquired?.slice(0,10) ?? '—'}` : null,
    intel ? `3DEP ${m.elevation?.value?.toFixed(1) ?? 'N/A'}m` : null,
    scan  ? `MSIGI ${scan.candidates?.length ?? 0} candidates` : null,
    scan?.muon_baseline?.valid ? `Muon ${scan.muon_baseline.flux_m2_min?.toFixed(0)}/m²/min Kp=${scan.muon_baseline.kp_index}` : null,
  ].filter(Boolean)

  storeReading(lat, lng, nexusScore)

  return NextResponse.json({
    ok: true,
    nexus: {
      lat, lng, score: parseFloat(nexusScore.toFixed(4)), tier,
      signals, weights: W, sources,
      candidates: scan?.candidates?.slice(0, 3) || [],
      spectral: scan?.spectral || null,
      muon: scan?.muon_baseline || null,
      elevation_m: m.elevation?.value ?? null,
      ndvi: m.ndvi?.value ?? null,
      sar_db: m.sar?.value ?? null,
      sentinel2_date: m.sentinel2_meta?.date?.slice(0,10) ?? null,
      sar_date: m.sar?.acquired?.slice(0,10) ?? null,
      timestamp: new Date().toISOString(),
    }
  })
}
