'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import {
  Billboard,
  Line,
  OrbitControls,
  Text,
} from '@react-three/drei'
import * as THREE from 'three'

type SignalType =
  | 'wifi'
  | 'bluetooth'
  | 'radio'
  | 'cellular'
  | 'zigbee'
  | 'lora'
  | 'unknown'

type ViewMode = 'map' | 'spectrum'

interface Coordinates {
  lat: number
  lon: number
}

interface SignalSession {
  scan_session: string
  count: number
  signal_types: string[]
}

interface SignalReading {
  id?: string
  session_id?: string

  observed_at?: string
  signal_type?: SignalType | string

  label?: string
  display_name?: string
  protocol?: string
  modulation?: string
  channel?: string | number

  frequency_hz?: number
  bandwidth_hz?: number

  rssi_dbm?: number
  snr_db?: number
  noise_dbm?: number

  node_id?: string

  receiver_lat?: number
  receiver_lon?: number

  estimated_lat?: number
  estimated_lon?: number
  location_accuracy_m?: number

  bearing_deg?: number
  bearing_uncertainty_deg?: number

  classification_confidence?: number
}

interface ReceiverNode {
  id: string
  lat: number
  lon: number
  lastSeen?: string
}

interface LocalPoint {
  x: number
  z: number
}

const SIGNAL_COLORS: Record<string, string> = {
  wifi: '#00aaff',
  bluetooth: '#aa44ff',
  radio: '#ff6600',
  cellular: '#00dd88',
  zigbee: '#ffee33',
  lora: '#ff4477',
  unknown: '#dddddd',
}

const FREQUENCY_BANDS = [
  {
    label: 'Sub-GHz',
    detail: '300–1000 MHz',
    min: 300e6,
    max: 1e9,
    z: -8,
  },
  {
    label: '1–2 GHz',
    detail: 'L-band',
    min: 1e9,
    max: 2e9,
    z: -4,
  },
  {
    label: '2.4 GHz',
    detail: 'Wi-Fi / BLE / Zigbee',
    min: 2.4e9,
    max: 2.5e9,
    z: 0,
  },
  {
    label: '5 GHz',
    detail: 'Wi-Fi',
    min: 5e9,
    max: 5.9e9,
    z: 4,
  },
  {
    label: '6 GHz+',
    detail: 'Upper microwave',
    min: 5.9e9,
    max: 20e9,
    z: 8,
  },
]

const MAX_SIGNALS = 2500
const MAP_METERS_TO_SCENE = 0.035

function normalizeSignalType(value?: string): SignalType {
  const type = value?.toLowerCase().trim()

  if (type === 'wifi' || type === 'wi-fi') return 'wifi'
  if (type === 'bluetooth' || type === 'ble') return 'bluetooth'
  if (type === 'cell' || type === 'cellular' || type === 'lte' || type === '5g') {
    return 'cellular'
  }
  if (type === 'zigbee') return 'zigbee'
  if (type === 'lora' || type === 'lorawan') return 'lora'
  if (type === 'radio' || type === 'rf' || type === 'sdr') return 'radio'

  return 'unknown'
}

function signalColor(reading: SignalReading): string {
  return SIGNAL_COLORS[normalizeSignalType(reading.signal_type)]
}

function formatFrequency(hz?: number): string {
  if (!Number.isFinite(hz)) return 'Unknown frequency'

  const value = hz as number

  if (value >= 1e9) return `${(value / 1e9).toFixed(4)} GHz`
  if (value >= 1e6) return `${(value / 1e6).toFixed(3)} MHz`
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)} kHz`

  return `${Math.round(value)} Hz`
}

function formatTime(value?: string): string {
  if (!value) return 'Just now'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Unknown time'

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getSignalLabel(signal: SignalReading): string {
  return (
    signal.display_name ||
    signal.label ||
    signal.protocol ||
    normalizeSignalType(signal.signal_type).toUpperCase()
  )
}

function getSignalKey(signal: SignalReading, index = 0): string {
  return (
    signal.id ||
    [
      signal.node_id,
      signal.signal_type,
      signal.frequency_hz,
      signal.observed_at,
      index,
    ].join('-')
  )
}

function rssiToHeight(rssi?: number): number {
  const safeRssi = Number.isFinite(rssi) ? (rssi as number) : -90
  return THREE.MathUtils.clamp((safeRssi + 110) / 7, 0.25, 9)
}

function geoToLocal(
  lat: number,
  lon: number,
  origin: Coordinates,
): LocalPoint {
  const latitudeMeters = (lat - origin.lat) * 110_540
  const longitudeMeters =
    (lon - origin.lon) *
    111_320 *
    Math.cos((origin.lat * Math.PI) / 180)

  return {
    x: longitudeMeters * MAP_METERS_TO_SCENE,
    z: -latitudeMeters * MAP_METERS_TO_SCENE,
  }
}

function offsetFromBearing(
  start: LocalPoint,
  bearingDegrees: number,
  length: number,
): LocalPoint {
  const radians = THREE.MathUtils.degToRad(bearingDegrees)

  return {
    x: start.x + Math.sin(radians) * length,
    z: start.z - Math.cos(radians) * length,
  }
}

function getBandPosition(frequency?: number): number {
  if (!Number.isFinite(frequency)) return 10

  const band = FREQUENCY_BANDS.find(
    item =>
      (frequency as number) >= item.min &&
      (frequency as number) <= item.max,
  )

  return band?.z ?? 10
}

function deterministicOffset(value: string): LocalPoint {
  let hash = 0

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }

  const angle = ((Math.abs(hash) % 360) * Math.PI) / 180
  const radius = 3 + (Math.abs(hash >> 4) % 100) / 20

  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
  }
}

function SignalMarker({
  signal,
  position,
  selected,
  onSelect,
}: {
  signal: SignalReading
  position: LocalPoint
  selected: boolean
  onSelect: () => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const height = rssiToHeight(signal.rssi_dbm)
  const color = signalColor(signal)

  useFrame(({ clock }) => {
    if (!groupRef.current) return

    const pulse = 1 + Math.sin(clock.elapsedTime * 2.2) * 0.06
    groupRef.current.scale.setScalar(selected ? pulse * 1.35 : pulse)
  })

  return (
    <group
      ref={groupRef}
      position={[position.x, 0, position.z]}
      onClick={event => {
        event.stopPropagation()
        onSelect()
      }}
    >
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.07, 0.2, height, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 1.8 : 0.8}
          transparent
          opacity={0.9}
        />
      </mesh>

      <mesh position={[0, height + 0.16, 0]}>
        <sphereGeometry args={[selected ? 0.24 : 0.15, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.2}
        />
      </mesh>

      {selected && (
        <Billboard position={[0, height + 0.8, 0]}>
          <Text
            fontSize={0.36}
            color="#ffffff"
            outlineColor="#000000"
            outlineWidth={0.025}
            anchorX="center"
          >
            {`${getSignalLabel(signal)}\n${formatFrequency(
              signal.frequency_hz,
            )}\n${signal.rssi_dbm ?? '?'} dBm`}
          </Text>
        </Billboard>
      )}
    </group>
  )
}

function EstimatedSourceMarker({
  signal,
  position,
}: {
  signal: SignalReading
  position: LocalPoint
}) {
  const color = signalColor(signal)
  const accuracy = Math.max(signal.location_accuracy_m ?? 10, 2)
  const radius = Math.min(
    accuracy * MAP_METERS_TO_SCENE,
    12,
  )

  return (
    <group position={[position.x, 0.06, position.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry
          args={[
            Math.max(radius - 0.08, 0.12),
            radius,
            48,
          ]}
        />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh position={[0, 0.25, 0]}>
        <octahedronGeometry args={[0.32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.5}
        />
      </mesh>
    </group>
  )
}

function ReceiverMarker({
  node,
  origin,
}: {
  node: ReceiverNode
  origin: Coordinates
}) {
  const point = geoToLocal(node.lat, node.lon, origin)

  return (
    <group position={[point.x, 0, point.z]}>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.45, 0.6, 0.45]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#3366ff"
          emissiveIntensity={0.7}
        />
      </mesh>

      <Billboard position={[0, 1.05, 0]}>
        <Text
          fontSize={0.3}
          color="#cbd5e1"
          outlineColor="#000000"
          outlineWidth={0.02}
        >
          {node.id}
        </Text>
      </Billboard>
    </group>
  )
}

function BearingRay({
  signal,
  origin,
}: {
  signal: SignalReading
  origin: Coordinates
}) {
  if (
    !Number.isFinite(signal.receiver_lat) ||
    !Number.isFinite(signal.receiver_lon) ||
    !Number.isFinite(signal.bearing_deg)
  ) {
    return null
  }

  const start = geoToLocal(
    signal.receiver_lat as number,
    signal.receiver_lon as number,
    origin,
  )

  const confidence = THREE.MathUtils.clamp(
    signal.classification_confidence ?? 0.5,
    0.1,
    1,
  )

  const length = 8 + confidence * 15
  const end = offsetFromBearing(
    start,
    signal.bearing_deg as number,
    length,
  )

  const color = signalColor(signal)

  return (
    <group>
      <Line
        points={[
          [start.x, 0.18, start.z],
          [end.x, 0.18, end.z],
        ]}
        color={color}
        lineWidth={2}
        transparent
        opacity={0.8}
      />

      <mesh
        position={[end.x, 0.18, end.z]}
        rotation={[
          0,
          THREE.MathUtils.degToRad(
            -(signal.bearing_deg as number),
          ),
          0,
        ]}
      >
        <coneGeometry args={[0.25, 0.7, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.9}
        />
      </mesh>
    </group>
  )
}

function MapScene({
  signals,
  origin,
  nodes,
  selectedSignalKey,
  onSelectSignal,
}: {
  signals: SignalReading[]
  origin: Coordinates
  nodes: ReceiverNode[]
  selectedSignalKey: string | null
  onSelectSignal: (signal: SignalReading, key: string) => void
}) {
  return (
    <>
      <ambientLight intensity={0.42} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={1.2}
      />
      <pointLight
        position={[-12, 10, -8]}
        intensity={1.2}
        color="#3366ff"
      />

      <fog attach="fog" args={['#050510', 45, 120]} />

      <gridHelper
        args={[80, 80, '#18314f', '#0a1728']}
        position={[0, -0.02, 0]}
      />

      <mesh
        position={[0, -0.035, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial
          color="#07111f"
          transparent
          opacity={0.75}
        />
      </mesh>

      {nodes.map(node => (
        <ReceiverMarker
          key={node.id}
          node={node}
          origin={origin}
        />
      ))}

      {signals.map((signal, index) => {
        const key = getSignalKey(signal, index)

        let position: LocalPoint

        if (
          Number.isFinite(signal.receiver_lat) &&
          Number.isFinite(signal.receiver_lon)
        ) {
          position = geoToLocal(
            signal.receiver_lat as number,
            signal.receiver_lon as number,
            origin,
          )
        } else {
          position = deterministicOffset(key)
        }

        return (
          <SignalMarker
            key={key}
            signal={signal}
            position={position}
            selected={selectedSignalKey === key}
            onSelect={() => onSelectSignal(signal, key)}
          />
        )
      })}

      {signals.map((signal, index) => {
        if (
          !Number.isFinite(signal.estimated_lat) ||
          !Number.isFinite(signal.estimated_lon)
        ) {
          return null
        }

        const position = geoToLocal(
          signal.estimated_lat as number,
          signal.estimated_lon as number,
          origin,
        )

        return (
          <EstimatedSourceMarker
            key={`estimate-${getSignalKey(signal, index)}`}
            signal={signal}
            position={position}
          />
        )
      })}

      {signals.map((signal, index) => (
        <BearingRay
          key={`bearing-${getSignalKey(signal, index)}`}
          signal={signal}
          origin={origin}
        />
      ))}

      <OrbitControls
        makeDefault
        enablePan
        enableRotate
        enableZoom
        minDistance={5}
        maxDistance={90}
        maxPolarAngle={Math.PI / 2.05}
      />
    </>
  )
}

function FrequencyPlane({
  label,
  detail,
  z,
}: {
  label: string
  detail: string
  z: number
}) {
  return (
    <group position={[0, 0, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[55, 3.3]} />
        <meshStandardMaterial
          color="#0b1b31"
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>

      <Billboard position={[-26, 0.5, 0]}>
        <Text
          fontSize={0.45}
          color="#8aa4c8"
          anchorX="left"
          outlineColor="#000000"
          outlineWidth={0.015}
        >
          {`${label} · ${detail}`}
        </Text>
      </Billboard>
    </group>
  )
}

function SpectrumScene({
  signals,
  selectedSignalKey,
  onSelectSignal,
}: {
  signals: SignalReading[]
  selectedSignalKey: string | null
  onSelectSignal: (signal: SignalReading, key: string) => void
}) {
  return (
    <>
      <ambientLight intensity={0.35} />
      <pointLight
        position={[15, 20, 12]}
        intensity={1.7}
        color="#3366ff"
      />
      <pointLight
        position={[-12, 8, -10]}
        intensity={0.8}
        color="#ff5500"
      />

      <fog attach="fog" args={['#050510', 45, 110]} />

      {FREQUENCY_BANDS.map(band => (
        <FrequencyPlane
          key={band.label}
          label={band.label}
          detail={band.detail}
          z={band.z}
        />
      ))}

      <gridHelper
        args={[60, 80, '#18314f', '#0a1728']}
        position={[0, -0.02, 0]}
      />

      {signals.map((signal, index) => {
        const key = getSignalKey(signal, index)
        const frequency = signal.frequency_hz ?? 0
        const bandZ = getBandPosition(frequency)

        const minFrequency = 300e6
        const maxFrequency = 20e9

        const logMin = Math.log10(minFrequency)
        const logMax = Math.log10(maxFrequency)
        const logFrequency = Math.log10(
          Math.max(frequency, minFrequency),
        )

        const normalized = THREE.MathUtils.clamp(
          (logFrequency - logMin) / (logMax - logMin),
          0,
          1,
        )

        const x = normalized * 50 - 25
        const timeOffset =
          ((new Date(signal.observed_at ?? 0).getTime() || index) %
            5000) /
            5000 -
          0.5

        return (
          <SignalMarker
            key={key}
            signal={signal}
            position={{
              x,
              z: bandZ + timeOffset * 2.4,
            }}
            selected={selectedSignalKey === key}
            onSelect={() => onSelectSignal(signal, key)}
          />
        )
      })}

      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        minDistance={8}
        maxDistance={90}
      />
    </>
  )
}

function SignalDetails({
  signal,
}: {
  signal: SignalReading | null
}) {
  if (!signal) {
    return (
      <div className="p-4 text-sm text-zinc-600 font-mono">
        Select a signal to inspect it.
      </div>
    )
  }

  const confidence = Number.isFinite(
    signal.classification_confidence,
  )
    ? `${Math.round(
        (signal.classification_confidence as number) * 100,
      )}%`
    : 'Unknown'

  return (
    <div className="p-4 border-b border-zinc-800">
      <div className="flex items-start gap-3">
        <div
          className="w-3 h-3 mt-1 rounded-full shrink-0"
          style={{ background: signalColor(signal) }}
        />

        <div className="min-w-0">
          <div className="text-zinc-100 font-semibold truncate">
            {getSignalLabel(signal)}
          </div>

          <div className="text-xs text-zinc-500 font-mono mt-1">
            {normalizeSignalType(signal.signal_type).toUpperCase()}
            {' · '}
            {formatFrequency(signal.frequency_hz)}
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-xs font-mono">
        <dt className="text-zinc-600">Strength</dt>
        <dd className="text-zinc-300 text-right">
          {signal.rssi_dbm ?? '—'} dBm
        </dd>

        <dt className="text-zinc-600">SNR</dt>
        <dd className="text-zinc-300 text-right">
          {signal.snr_db ?? '—'} dB
        </dd>

        <dt className="text-zinc-600">Channel</dt>
        <dd className="text-zinc-300 text-right">
          {signal.channel ?? '—'}
        </dd>

        <dt className="text-zinc-600">Protocol</dt>
        <dd className="text-zinc-300 text-right">
          {signal.protocol ?? 'Unknown'}
        </dd>

        <dt className="text-zinc-600">Modulation</dt>
        <dd className="text-zinc-300 text-right">
          {signal.modulation ?? 'Unknown'}
        </dd>

        <dt className="text-zinc-600">Confidence</dt>
        <dd className="text-zinc-300 text-right">
          {confidence}
        </dd>

        <dt className="text-zinc-600">Receiver</dt>
        <dd className="text-zinc-300 text-right truncate">
          {signal.node_id ?? 'Unknown'}
        </dd>

        <dt className="text-zinc-600">Bearing</dt>
        <dd className="text-zinc-300 text-right">
          {Number.isFinite(signal.bearing_deg)
            ? `${signal.bearing_deg}°`
            : '—'}
        </dd>

        <dt className="text-zinc-600">Estimated accuracy</dt>
        <dd className="text-zinc-300 text-right">
          {Number.isFinite(signal.location_accuracy_m)
            ? `±${signal.location_accuracy_m} m`
            : '—'}
        </dd>
      </dl>
    </div>
  )
}

export default function WhisperMap() {
  const [signals, setSignals] = useState<SignalReading[]>([])
  const [sessions, setSessions] = useState<SignalSession[]>([])
  const [sessionId, setSessionId] = useState('')
  const [manualSession, setManualSession] = useState('')

  const [filter, setFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [minimumRssi, setMinimumRssi] = useState(-110)

  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [viewMode, setViewMode] =
    useState<ViewMode>('map')

  const [selectedSignal, setSelectedSignal] =
    useState<SignalReading | null>(null)
  const [selectedSignalKey, setSelectedSignalKey] =
    useState<string | null>(null)

  const [deviceLocation, setDeviceLocation] =
    useState<Coordinates | null>(null)

  const pollAbortRef = useRef<AbortController | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const API = (
    process.env.NEXT_PUBLIC_ENGINE_URL ?? ''
  ).replace(/\/$/, '')

  const loadSessions = useCallback(async () => {
    try {
      const response = await fetch(
        `${API}/api/signals/sessions`,
        {
          cache: 'no-store',
        },
      )

      if (!response.ok) {
        throw new Error(
          `Sessions request failed: ${response.status}`,
        )
      }

      const data = await response.json()

      setSessions(Array.isArray(data) ? data : [])
    } catch (requestError) {
      console.error(requestError)
    }
  }, [API])

  const loadSignals = useCallback(
    async (sid: string, silent = false) => {
      if (!sid) return

      pollAbortRef.current?.abort()

      const controller = new AbortController()
      pollAbortRef.current = controller

      if (!silent) setLoading(true)

      try {
        const response = await fetch(
          `${API}/api/signals/session/${encodeURIComponent(
            sid,
          )}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          },
        )

        if (!response.ok) {
          throw new Error(
            `Signal request failed: ${response.status}`,
          )
        }

        const data = await response.json()

        if (!Array.isArray(data)) {
          throw new Error(
            'Signal endpoint did not return an array',
          )
        }

        setSignals(
          data
            .filter(
              item => item && typeof item === 'object',
            )
            .slice(-MAX_SIGNALS),
        )

        setConnected(true)
        setError(null)
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === 'AbortError'
        ) {
          return
        }

        setConnected(false)
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load signals',
        )
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [API],
  )

  const startLiveStream = useCallback(
    (sid: string) => {
      eventSourceRef.current?.close()

      if (!sid) return

      const url =
        `${API}/api/signals/live?session_id=` +
        encodeURIComponent(sid)

      const eventSource = new EventSource(url)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        setConnected(true)
        setError(null)
      }

      eventSource.onmessage = event => {
        try {
          const incoming = JSON.parse(
            event.data,
          ) as SignalReading | SignalReading[]

          const additions = Array.isArray(incoming)
            ? incoming
            : [incoming]

          setSignals(current => {
            const combined = [...current, ...additions]
            const byId = new Map<string, SignalReading>()

            combined.forEach((signal, index) => {
              byId.set(
                getSignalKey(signal, index),
                signal,
              )
            })

            return Array.from(byId.values()).slice(
              -MAX_SIGNALS,
            )
          })
        } catch (parseError) {
          console.error(
            'Unable to parse live signal event',
            parseError,
          )
        }
      }

      eventSource.onerror = () => {
        setConnected(false)
        eventSource.close()
      }
    },
    [API],
  )

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  useEffect(() => {
    if (!sessionId) {
      setSignals([])
      setConnected(false)
      return
    }

    void loadSignals(sessionId)
    startLiveStream(sessionId)

    const poll = window.setInterval(() => {
      if (eventSourceRef.current?.readyState !== 1) {
        void loadSignals(sessionId, true)
      }
    }, 5000)

    return () => {
      window.clearInterval(poll)
      pollAbortRef.current?.abort()
      eventSourceRef.current?.close()
    }
  }, [sessionId, loadSignals, startLiveStream])

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setError(
        'Geolocation is not supported by this browser.',
      )
      return
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        setDeviceLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        })
        setError(null)
      },
      locationError => {
        setError(locationError.message)
      },
      {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 10_000,
      },
    )
  }

  const origin = useMemo<Coordinates>(() => {
    if (deviceLocation) return deviceLocation

    const locatedSignal = signals.find(
      signal =>
        Number.isFinite(signal.receiver_lat) &&
        Number.isFinite(signal.receiver_lon),
    )

    if (locatedSignal) {
      return {
        lat: locatedSignal.receiver_lat as number,
        lon: locatedSignal.receiver_lon as number,
      }
    }

    return {
      lat: 0,
      lon: 0,
    }
  }, [deviceLocation, signals])

  const nodes = useMemo<ReceiverNode[]>(() => {
    const byNode = new Map<string, ReceiverNode>()

    signals.forEach(signal => {
      if (
        !Number.isFinite(signal.receiver_lat) ||
        !Number.isFinite(signal.receiver_lon)
      ) {
        return
      }

      const id = signal.node_id || 'receiver'

      byNode.set(id, {
        id,
        lat: signal.receiver_lat as number,
        lon: signal.receiver_lon as number,
        lastSeen: signal.observed_at,
      })
    })

    if (deviceLocation && !byNode.has('this-device')) {
      byNode.set('this-device', {
        id: 'this-device',
        ...deviceLocation,
      })
    }

    return Array.from(byNode.values())
  }, [signals, deviceLocation])

  const visibleSignals = useMemo(() => {
    const query = search.trim().toLowerCase()

    return signals
      .filter(signal => {
        const type = normalizeSignalType(
          signal.signal_type,
        )

        if (filter && type !== filter) return false

        if (
          Number.isFinite(signal.rssi_dbm) &&
          (signal.rssi_dbm as number) < minimumRssi
        ) {
          return false
        }

        if (!query) return true

        const searchable = [
          signal.display_name,
          signal.label,
          signal.protocol,
          signal.modulation,
          signal.signal_type,
          signal.node_id,
          signal.frequency_hz,
          signal.channel,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return searchable.includes(query)
      })
      .sort((a, b) => {
        const bTime = new Date(
          b.observed_at ?? 0,
        ).getTime()
        const aTime = new Date(
          a.observed_at ?? 0,
        ).getTime()

        return bTime - aTime
      })
  }, [signals, filter, minimumRssi, search])

  const selectSignal = (
    signal: SignalReading,
    key: string,
  ) => {
    setSelectedSignal(signal)
    setSelectedSignalKey(key)
  }

  const loadManualSession = () => {
    const value = manualSession.trim()

    if (!value) return

    setSessionId(value)
  }

  return (
    <main className="relative w-full h-screen bg-[#050510] text-zinc-100 overflow-hidden flex flex-col">
      <header className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-3 bg-zinc-950 border-b border-zinc-800 z-20">
        <span className="font-mono text-sm font-semibold tracking-widest uppercase whitespace-nowrap">
          ◈ Whisper Map
        </span>

        <div
          className={`w-2.5 h-2.5 rounded-full ${
            connected
              ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]'
              : 'bg-red-500'
          }`}
          title={
            connected ? 'Live connection active' : 'Disconnected'
          }
        />

        <select
          value={sessionId}
          onChange={event => {
            setSessionId(event.target.value)
            setManualSession(event.target.value)
          }}
          className="bg-zinc-900 text-zinc-300 text-xs font-mono px-2 py-1.5 rounded border border-zinc-700"
        >
          <option value="">— select session —</option>

          {sessions.map(session => (
            <option
              key={session.scan_session}
              value={session.scan_session}
            >
              {session.scan_session.slice(0, 8)}… ·{' '}
              {session.count} signals
            </option>
          ))}
        </select>

        <form
          className="flex"
          onSubmit={event => {
            event.preventDefault()
            loadManualSession()
          }}
        >
          <input
            value={manualSession}
            onChange={event =>
              setManualSession(event.target.value)
            }
            className="bg-zinc-900 text-zinc-300 px-2 py-1.5 rounded-l text-xs border border-zinc-700 w-44 md:w-64 font-mono"
            placeholder="session UUID"
          />

          <button
            type="submit"
            className="px-3 py-1.5 rounded-r text-xs font-mono bg-blue-700 hover:bg-blue-600"
          >
            Load
          </button>
        </form>

        <button
          onClick={requestLocation}
          className="px-3 py-1.5 rounded text-xs font-mono bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
        >
          ◎ Use my location
        </button>

        <div className="flex border border-zinc-700 rounded overflow-hidden">
          <button
            onClick={() => setViewMode('map')}
            className={`px-3 py-1.5 text-xs font-mono ${
              viewMode === 'map'
                ? 'bg-blue-700 text-white'
                : 'bg-zinc-900 text-zinc-500'
            }`}
          >
            Map
          </button>

          <button
            onClick={() => setViewMode('spectrum')}
            className={`px-3 py-1.5 text-xs font-mono ${
              viewMode === 'spectrum'
                ? 'bg-blue-700 text-white'
                : 'bg-zinc-900 text-zinc-500'
            }`}
          >
            Spectrum
          </button>
        </div>

        <span className="ml-auto text-xs font-mono text-zinc-500">
          {loading
            ? '⟳ syncing'
            : `${visibleSignals.length} visible / ${signals.length} total`}
        </span>
      </header>

      {error && (
        <div className="shrink-0 px-4 py-2 text-xs font-mono text-red-300 bg-red-950/60 border-b border-red-900">
          {error}
        </div>
      )}

      <section className="flex flex-1 min-h-0">
        <div className="relative flex-1 min-w-0">
          <Canvas
            camera={{
              position:
                viewMode === 'map'
                  ? [14, 20, 24]
                  : [10, 18, 30],
              fov: 52,
            }}
            gl={{
              antialias: true,
            }}
            style={{
              background: '#050510',
            }}
            onPointerMissed={() => {
              setSelectedSignal(null)
              setSelectedSignalKey(null)
            }}
          >
            {viewMode === 'map' ? (
              <MapScene
                signals={visibleSignals}
                origin={origin}
                nodes={nodes}
                selectedSignalKey={selectedSignalKey}
                onSelectSignal={selectSignal}
              />
            ) : (
              <SpectrumScene
                signals={visibleSignals}
                selectedSignalKey={selectedSignalKey}
                onSelectSignal={selectSignal}
              />
            )}
          </Canvas>

          <div className="absolute top-4 left-4 flex flex-wrap gap-2 pointer-events-none">
            {Object.entries(SIGNAL_COLORS).map(
              ([type, color]) => (
                <div
                  key={type}
                  className="flex items-center gap-1.5 bg-zinc-950/75 border border-zinc-800 px-2 py-1 rounded backdrop-blur"
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="text-[10px] text-zinc-400 font-mono uppercase">
                    {type}
                  </span>
                </div>
              ),
            )}
          </div>

          {viewMode === 'map' && (
            <div className="absolute bottom-4 left-4 max-w-sm text-[11px] font-mono text-zinc-500 bg-zinc-950/75 border border-zinc-800 p-3 rounded backdrop-blur pointer-events-none">
              Spikes show where receivers detected signals.
              Lines show reported bearings. Diamond markers
              and circles show estimated transmitter locations
              and uncertainty.
            </div>
          )}
        </div>

        <aside className="w-[360px] max-w-[42vw] min-w-[300px] bg-zinc-950 border-l border-zinc-800 flex flex-col min-h-0">
          <SignalDetails signal={selectedSignal} />

          <div className="p-3 border-b border-zinc-800 space-y-3">
            <input
              value={search}
              onChange={event =>
                setSearch(event.target.value)
              }
              placeholder="Search type, name, frequency..."
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs font-mono text-zinc-300"
            />

            <div className="flex flex-wrap gap-1.5">
              {[
                null,
                'wifi',
                'bluetooth',
                'radio',
                'cellular',
                'zigbee',
                'lora',
                'unknown',
              ].map(type => (
                <button
                  key={type ?? 'all'}
                  onClick={() => setFilter(type)}
                  className={`px-2 py-1 rounded text-[10px] uppercase tracking-wider font-mono ${
                    filter === type
                      ? 'bg-blue-700 text-white'
                      : 'bg-zinc-900 text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  {type ?? 'all'}
                </button>
              ))}
            </div>

            <label className="block text-[10px] uppercase tracking-wider font-mono text-zinc-600">
              Minimum strength: {minimumRssi} dBm
            </label>

            <input
              type="range"
              min={-110}
              max={-20}
              step={1}
              value={minimumRssi}
              onChange={event =>
                setMinimumRssi(
                  Number(event.target.value),
                )
              }
              className="w-full"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {visibleSignals.length === 0 ? (
              <div className="p-6 text-center text-sm font-mono text-zinc-600">
                {sessionId
                  ? 'No matching observations yet.'
                  : 'Select or enter a scan session.'}
              </div>
            ) : (
              visibleSignals.slice(0, 500).map(
                (signal, index) => {
                  const key = getSignalKey(
                    signal,
                    index,
                  )
                  const selected =
                    key === selectedSignalKey

                  return (
                    <button
                      key={key}
                      onClick={() =>
                        selectSignal(signal, key)
                      }
                      className={`block w-full px-3 py-3 text-left border-b border-zinc-900 transition ${
                        selected
                          ? 'bg-blue-950/60'
                          : 'hover:bg-zinc-900/80'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className="w-2.5 h-2.5 mt-1 rounded-full shrink-0"
                          style={{
                            background:
                              signalColor(signal),
                          }}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex gap-2 items-start justify-between">
                            <span className="text-sm text-zinc-200 truncate">
                              {getSignalLabel(signal)}
                            </span>

                            <span className="text-[10px] font-mono text-zinc-600 shrink-0">
                              {formatTime(
                                signal.observed_at,
                              )}
                            </span>
                          </div>

                          <div className="mt-1 flex items-center justify-between text-[11px] font-mono">
                            <span className="text-zinc-500">
                              {formatFrequency(
                                signal.frequency_hz,
                              )}
                            </span>

                            <span
                              className={
                                (signal.rssi_dbm ??
                                  -110) >
                                -60
                                  ? 'text-emerald-400'
                                  : (signal.rssi_dbm ??
                                        -110) >
                                      -80
                                    ? 'text-amber-400'
                                    : 'text-zinc-500'
                              }
                            >
                              {signal.rssi_dbm ??
                                '—'}{' '}
                              dBm
                            </span>
                          </div>

                          <div className="mt-1 text-[10px] font-mono text-zinc-600 truncate">
                            {normalizeSignalType(
                              signal.signal_type,
                            ).toUpperCase()}
                            {signal.node_id
                              ? ` · ${signal.node_id}`
                              : ''}
                            {Number.isFinite(
                              signal.bearing_deg,
                            )
                              ? ` · bearing ${signal.bearing_deg}°`
                              : ''}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                },
              )
            )}
          </div>
        </aside>
      </section>
    </main>
  )
}
