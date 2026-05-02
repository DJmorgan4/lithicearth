'use client'
import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Crosshair, AlertCircle, Loader, CheckCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

function clampLat(lat: number) { return Math.max(-90, Math.min(90, lat)) }
function wrapLng(lng: number) { return ((((lng + 180) % 360) + 360) % 360) - 180 }
function sanitizeCoords(lat: number, lng: number) {
  return { lat: parseFloat(clampLat(lat).toFixed(5)), lng: parseFloat(wrapLng(lng).toFixed(5)) }
}

interface ScanResult {
  location: { lat: number; lng: number }
  radius_m: number
  context: { type: string; dem_source: string; ndvi_valid: boolean; sar_valid: boolean }
  layers: Record<string, any>
  candidates: any[]
  evidence_score: number | null
  quality: Record<string, any>
  note: string
}

function ScanInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const circleRef = useRef<any>(null)

  const rawLat = parseFloat(searchParams.get('lat') || '33.17429')
  const rawLng = parseFloat(searchParams.get('lng') || '-96.61903')
  const initCoords = sanitizeCoords(rawLat, rawLng)

  const [coords, setCoords] = useState(initCoords)
  const [radius, setRadius] = useState(500)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState(false)

  const runScan = useCallback(async (lat: number, lng: number, r: number) => {
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return
    setScanning(true)
    setError(false)
    setResult(null)
    try {
      const res = await fetch(`/api/scan?lat=${lat}&lng=${lng}&radius=${r}`)
      if (!res.ok) throw new Error('engine offline')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
    } catch {
      setError(true)
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return
    const init = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      const map = L.map(mapRef.current!, { center: [initCoords.lat, initCoords.lng], zoom: 13, zoomControl: false, attributionControl: false })
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map)
      leafletRef.current = map

      const icon = L.divIcon({
        className: '',
        html: `<div style="width:20px;height:20px;position:relative;">
          <div style="position:absolute;top:50%;left:0;right:0;height:1px;background:#D4AF37;transform:translateY(-50%)"></div>
          <div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:#D4AF37;transform:translateX(-50%)"></div>
          <div style="position:absolute;top:50%;left:50%;width:6px;height:6px;background:#D4AF37;border-radius:50%;transform:translate(-50%,-50%)"></div>
        </div>`,
        iconSize: [20, 20], iconAnchor: [10, 10],
      })
      markerRef.current = L.marker([initCoords.lat, initCoords.lng], { icon }).addTo(map)
      circleRef.current = L.circle([initCoords.lat, initCoords.lng], { radius: 500, color: '#D4AF37', weight: 1, fillColor: '#D4AF37', fillOpacity: 0.08 }).addTo(map)

      map.on('click', (e: any) => {
        const safe = sanitizeCoords(e.latlng.lat, e.latlng.lng)
        setCoords(safe)
        markerRef.current?.setLatLng([safe.lat, safe.lng])
        circleRef.current?.setLatLng([safe.lat, safe.lng])
        router.replace(`/portal/scan?lat=${safe.lat}&lng=${safe.lng}`, { scroll: false })
      })
    }
    init()
    return () => { leafletRef.current?.remove(); leafletRef.current = null }
  }, [])

  useEffect(() => {
    circleRef.current?.setRadius(radius)
  }, [radius])

  const contextColor = (type: string) => {
    if (type === 'ice' || type === 'arctic') return '#38bdf8'
    if (type === 'land') return '#4ade80'
    return '#94a3b8'
  }

  return (
    <div className="flex h-screen bg-[#0a0e0b] overflow-hidden font-light">
      {/* Sidebar */}
      <aside className="w-64 h-full bg-[#0b0f0c] border-r border-[#1a2a1e] flex flex-col z-10 flex-shrink-0">
        <div className="px-4 py-3 border-b border-[#1a2a1e] flex items-center gap-2">
          <Link href="/portal/viewer" className="text-[#3a4a3e] hover:text-[#5b7c6f] transition-colors">
            <ArrowLeft size={12} />
          </Link>
          <span className="text-[#5b7c6f] text-[9px] tracking-[0.3em]">SCAN AOI</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Coords */}
          <div>
            <p className="text-[#3a4a3e] text-[8px] tracking-[0.2em] mb-1">TARGET</p>
            <p className="text-[#c8c4ba] text-[10px]">{coords.lat}°, {coords.lng}°</p>
            <p className="text-[#2a3a2e] text-[8px]">click map to reposition</p>
          </div>

          {/* Radius */}
          <div>
            <p className="text-[#3a4a3e] text-[8px] tracking-[0.2em] mb-2">RADIUS — {radius}m</p>
            <input
              type="range" min="100" max="5000" step="100"
              value={radius}
              onChange={e => setRadius(Number(e.target.value))}
              className="w-full h-px cursor-pointer"
              style={{ accentColor: '#D4AF37' }}
            />
            <div className="flex justify-between text-[#2a3a2e] text-[8px] mt-1">
              <span>100m</span><span>5km</span>
            </div>
          </div>

          {/* Run Scan */}
          <button
            onClick={() => runScan(coords.lat, coords.lng, radius)}
            disabled={scanning}
            className="w-full py-2.5 border border-[#D4AF37]/40 hover:border-[#D4AF37] text-[#D4AF37] text-[9px] tracking-[0.2em] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {scanning ? 'SCANNING...' : 'RUN SCAN'}
          </button>
        </div>
      </aside>

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="w-full h-full" />

        {/* Status overlay */}
        {scanning && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-[#0b0f0c]/95 border border-[#1a2a1e] px-4 py-2 flex items-center gap-2">
            <Loader size={10} className="text-[#D4AF37] animate-spin" />
            <span className="text-[#c8c4ba] text-[9px] tracking-[0.15em]">ACQUIRING DATA</span>
          </div>
        )}
      </div>

      {/* Results panel */}
      <aside className="w-72 h-full bg-[#0b0f0c] border-l border-[#1a2a1e] flex flex-col z-10 flex-shrink-0">
        <div className="px-4 py-3 border-b border-[#1a2a1e]">
          <span className="text-[#5b7c6f] text-[9px] tracking-[0.3em]">EVIDENCE</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!result && !error && !scanning && (
            <div className="p-6 flex flex-col items-center gap-3 mt-8">
              <Crosshair size={24} className="text-[#2a3a2e]" />
              <p className="text-[#2a3a2e] text-[9px] tracking-[0.15em] text-center">SELECT A POINT AND RUN SCAN</p>
            </div>
          )}

          {error && (
            <div className="p-6 flex flex-col items-center gap-3 mt-8">
              <AlertCircle size={24} className="text-red-500/50" />
              <p className="text-[#3a4a3e] text-[9px] tracking-[0.15em] text-center">SCAN FAILED — ENGINE OFFLINE</p>
            </div>
          )}

          {scanning && (
            <div className="p-6 flex flex-col items-center gap-3 mt-8">
              <Loader size={24} className="text-[#D4AF37]/50 animate-spin" />
              <p className="text-[#3a4a3e] text-[9px] tracking-[0.15em] text-center">ACQUIRING MULTI-SENSOR DATA</p>
            </div>
          )}

          {result && (
            <div className="p-4 space-y-4">
              {/* Context */}
              <div className="border border-[#1a2a1e] p-3">
                <p className="text-[#3a4a3e] text-[8px] tracking-[0.2em] mb-2">SURFACE CONTEXT</p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: contextColor(result.context.type) }} />
                  <span className="text-[#c8c4ba] text-[10px] uppercase">{result.context.type}</span>
                </div>
                <p className="text-[#2a3a2e] text-[8px] mt-1">DEM: {result.context.dem_source}</p>
              </div>

              {/* Layers */}
              <div className="border border-[#1a2a1e] p-3">
                <p className="text-[#3a4a3e] text-[8px] tracking-[0.2em] mb-2">DATA LAYERS</p>
                {Object.entries(result.layers).map(([key, val]: [string, any]) => (
                  <div key={key} className="flex items-baseline justify-between py-1 border-b border-[#0f160f] last:border-0">
                    <span className="text-[#3a4a3e] text-[8px] uppercase">{key}</span>
                    <span className="text-[#c8c4ba] text-[9px]">
                      {val.status === 'found' ? `${val.value} ${val.unit || ''}` :
                       val.status === 'suppressed' ? 'suppressed' : val.status}
                    </span>
                  </div>
                ))}
                {Object.keys(result.layers).length === 0 && (
                  <p className="text-[#2a3a2e] text-[8px]">no layers returned</p>
                )}
              </div>

              {/* Quality */}
              <div className="border border-[#1a2a1e] p-3">
                <p className="text-[#3a4a3e] text-[8px] tracking-[0.2em] mb-2">QUALITY</p>
                {Object.entries(result.quality).map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between py-1 border-b border-[#0f160f] last:border-0">
                    <span className="text-[#3a4a3e] text-[8px]">{k.replace(/_/g, ' ')}</span>
                    <span className="text-[#c8c4ba] text-[9px]">{String(v)}</span>
                  </div>
                ))}
              </div>

              {/* Note */}
              {result.note && (
                <p className="text-[#2a3a2e] text-[8px] italic">{result.note}</p>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-[#0a0e0b] flex items-center justify-center"><span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">LOADING</span></div>}>
      <ScanInner />
    </Suspense>
  )
}
