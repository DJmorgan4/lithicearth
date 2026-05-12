'use client'
import { useEffect, useState, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'

const SIGNAL_COLORS: Record<string, string> = {
  wifi:      '#00aaff',
  bluetooth: '#aa44ff',
  radio:     '#ff6600',
}

const FREQ_BANDS = [
  { label: '433 MHz', min: 430e6, max: 436e6, z: 0 },
  { label: '915 MHz', min: 910e6, max: 920e6, z: 3 },
  { label: '2.4 GHz', min: 2.4e9, max: 2.5e9, z: 6 },
  { label: '5 GHz',   min: 5.0e9, max: 5.9e9, z: 9 },
]

function getBandZ(freq: number) {
  const band = FREQ_BANDS.find(b => freq >= b.min && freq <= b.max)
  return band ? band.z : 1.5
}

function SignalSpike({ reading }: { reading: any }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const z = getBandZ(reading.frequency_hz ?? 2.4e9)
  const x = ((reading.lon ?? 0) + 180) * 0.08
  const y = ((reading.lat ?? 0) + 90) * 0.08
  const height = Math.max(0.1, ((reading.rssi_dbm ?? -80) + 100) / 8)
  const color = SIGNAL_COLORS[reading.signal_type] ?? '#ffffff'

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const pulse = Math.sin(clock.elapsedTime * 2 + x * 3) * 0.04
      meshRef.current.scale.y = 1 + pulse
    }
  })

  return (
    <mesh ref={meshRef} position={[x, height / 2, z + y * 0.1]}>
      <cylinderGeometry args={[0.015, 0.04, height, 6]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.5}
        transparent
        opacity={0.9}
      />
    </mesh>
  )
}

function FreqPlane({ band }: { band: typeof FREQ_BANDS[0] }) {
  return (
    <group position={[0, 0, band.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#0a1628" transparent opacity={0.07} side={THREE.DoubleSide} />
      </mesh>
      <Billboard position={[-24, 0.3, 0]}>
        <Text fontSize={0.35} color="#6688bb" anchorX="left">{band.label}</Text>
      </Billboard>
    </group>
  )
}

export default function WhisperMap() {
  const [signals, setSignals] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [sessionId, setSessionId] = useState('')
  const [filter, setFilter] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const API = process.env.NEXT_PUBLIC_ENGINE_URL

  useEffect(() => {
    fetch(`${API}/api/signals/sessions`)
      .then(r => r.json())
      .then(setSessions)
      .catch(() => {})
  }, [])

  const load = async (sid: string) => {
    if (!sid) return
    setLoading(true)
    const res = await fetch(`${API}/api/signals/session/${sid}`)
    const data = await res.json()
    setSignals(data)
    setLoading(false)
  }

  useEffect(() => {
    if (!sessionId) return
    load(sessionId)
    const iv = setInterval(() => load(sessionId), 15000)
    return () => clearInterval(iv)
  }, [sessionId])

  const visible = filter ? signals.filter(s => s.signal_type === filter) : signals

  return (
    <div className="w-full min-h-screen bg-[#050510] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-zinc-950 border-b border-zinc-800">
        <span className="text-zinc-100 font-mono text-sm font-semibold tracking-widest uppercase">
          ◈ Whisper Map
        </span>
        <select
          className="bg-zinc-900 text-zinc-300 text-xs font-mono px-2 py-1.5 rounded 
                     border border-zinc-700 ml-2"
          onChange={e => { setSessionId(e.target.value); }}
          defaultValue=""
        >
          <option value="">— select session —</option>
          {sessions.map(s => (
            <option key={s.scan_session} value={s.scan_session}>
              {s.scan_session.slice(0, 8)}… · {s.count} signals · {s.signal_types.join('/')}
            </option>
          ))}
        </select>
        <input
          className="bg-zinc-900 text-zinc-400 px-2 py-1.5 rounded text-xs border 
                     border-zinc-700 w-full md:w-64 font-mono"
          placeholder="or paste session UUID..."
          onBlur={e => { setSessionId(e.target.value); }}
        />
        <div className="flex gap-2 ml-2">
          {[null, 'wifi', 'bluetooth', 'radio'].map(t => (
            <button
              key={t ?? 'all'}
              onClick={() => setFilter(t)}
              className={`px-2.5 py-1 rounded text-xs font-mono uppercase tracking-wider
                ${filter === t
                  ? 'bg-blue-700 text-white'
                  : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
            >
              {t ?? 'all'}
            </button>
          ))}
        </div>
        <span className="ml-auto text-zinc-600 text-xs font-mono">
          {loading ? '⟳ syncing' : `${visible.length} signals`}
        </span>
      </div>

      {/* 3D Canvas */}
      <div className="flex-1">
        <Canvas camera={{ position: [10, 18, 28], fov: 55 }}
                gl={{ antialias: true }} style={{ background: '#050510' }}>
          <ambientLight intensity={0.25} />
          <pointLight position={[15, 25, 10]} intensity={1.8} color="#3366ff" />
          <pointLight position={[-10, 8, -8]} intensity={0.9} color="#ff5500" />
          <fog attach="fog" args={['#050510', 40, 90]} />

          {FREQ_BANDS.map(b => <FreqPlane key={b.label} band={b} />)}

          <gridHelper args={[60, 80, '#0d1a2e', '#0a1220']}
                      position={[15, -0.01, 5]} rotation={[Math.PI / 2, 0, 0]} />

          {visible.map((s, i) => <SignalSpike key={s.id ?? i} reading={s} />)}

          <OrbitControls enablePan enableZoom enableRotate
                         autoRotate={visible.length > 0} autoRotateSpeed={0.25} />
        </Canvas>
      </div>

      {/* Legend */}
      <div className="absolute bottom-5 left-5 flex gap-5 pointer-events-none">
        {Object.entries(SIGNAL_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-xs text-zinc-500 font-mono uppercase">{type}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-4">
          <span className="text-xs text-zinc-600 font-mono">height = signal strength</span>
        </div>
      </div>
    </div>
  )
}
