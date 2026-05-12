'use client'

import { useState } from 'react'
import { ChevronRight, Eye, EyeOff, Download, Zap, Radio, Waves, Mountain, Thermometer, Atom, Droplets, Satellite } from 'lucide-react'

const LAYER_CATEGORIES = [
  {
    id: 'radar',
    label: 'RADAR & MICROWAVE',
    icon: Radio,
    accent: '#4ade80',
    layers: [
      {
        id: 'sar',
        name: 'Synthetic Aperture Radar',
        abbr: 'SAR',
        description: 'Active microwave imaging penetrates cloud cover and vegetation. Reveals subsurface structures, soil moisture, and surface roughness at centimeter resolution.',
        resolution: '1–10m',
        source: 'Sentinel-1, ALOS-2, NISAR',
        wavelength: 'C-band 5.6cm / L-band 23.6cm',
        use: ['Subsurface mapping', 'Flood detection', 'Soil moisture', 'Vegetation structure'],
        available: true,
        status: 'live',
      },
      {
        id: 'insar',
        name: 'Interferometric SAR',
        abbr: 'InSAR',
        description: 'Phase difference between two SAR acquisitions measures ground deformation down to 1–2mm. Essential for detecting subsidence, uplift, and fault creep.',
        resolution: '20–100m',
        source: 'Sentinel-1 dual-pass',
        wavelength: 'C-band / X-band',
        use: ['Ground subsidence', 'Fault monitoring', 'Landslide detection', 'Infrastructure monitoring'],
        available: true,
        status: 'live',
      },
      {
        id: 'polsar',
        name: 'Polarimetric SAR',
        abbr: 'PolSAR',
        description: 'Full polarimetric decomposition (HH/HV/VH/VV) distinguishes materials by their scattering mechanisms. Enables target classification without spectral data.',
        resolution: '3–25m',
        source: 'ALOS-2 PALSAR-2, RADARSAT-2',
        wavelength: 'L-band / C-band',
        use: ['Material classification', 'Archaeological sites', 'Buried feature detection', 'Forest structure'],
        available: false,
        status: 'processing',
      },
    ]
  },
  {
    id: 'optical',
    label: 'OPTICAL & SPECTRAL',
    icon: Eye,
    accent: '#38bdf8',
    layers: [
      {
        id: 'hyperspectral',
        name: 'Hyperspectral Imaging',
        abbr: 'HSI',
        description: 'Hundreds of contiguous spectral bands (400–2500nm) capture full reflectance signatures. Identifies specific minerals, vegetation species, and soil chemistries invisible to RGB. NASA EMIT maps mineral composition globally.',
        resolution: '3–30m',
        source: 'NASA EMIT, AVIRIS, PRISMA, DESIS, EnMAP',
        wavelength: 'VNIR + SWIR (400–2500nm)',
        use: ['Mineral mapping', 'Archaeological soil marks', 'Pollution detection', 'Crop stress'],
        available: true,
        status: 'live',
      },
      {
        id: 'multispectral',
        name: 'Multispectral Imaging',
        abbr: 'MSI',
        description: 'Discrete spectral bands across visible and near-infrared. NDVI, NDWI, and custom indices reveal vegetation health, water bodies, and anthropogenic soil disturbance.',
        resolution: '3–30m',
        source: 'Sentinel-2, Landsat-9, Planet',
        wavelength: 'VIS + NIR + SWIR',
        use: ['Vegetation indices', 'Water mapping', 'Soil analysis', 'Land change detection'],
        available: true,
        status: 'live',
      },
      {
        id: 'nighttime',
        name: 'Nighttime / Low-Light',
        abbr: 'NTL',
        description: 'VIIRS Day/Night Band captures nocturnal radiance collecting visible/infrared global observations nightly. Reveals human activity patterns, infrastructure, and temporal economic signals.',
        resolution: '500m–1km',
        source: 'VIIRS DNB, DMSP/OLS',
        wavelength: 'Panchromatic 500–900nm',
        use: ['Activity patterns', 'Economic proxies', 'Temporal change', 'Infrastructure mapping'],
        available: true,
        status: 'live',
      },
    ]
  },
  {
    id: 'elevation',
    label: 'ELEVATION & LIDAR',
    icon: Mountain,
    accent: '#fb923c',
    layers: [
      {
        id: 'lidar',
        name: 'LiDAR Point Cloud',
        abbr: 'LiDAR',
        description: 'USGS 3DEP provides free, unrestricted airborne laser scanning across the US — streamable as Entwine Point Tiles on AWS. Ground-filtered bare-earth models reveal micro-topography and buried earthworks.',
        resolution: '0.5–2m',
        source: 'USGS 3DEP (AWS EPT), OpenTopography, TNRIS',
        wavelength: '1064nm / 532nm',
        use: ['Micro-topography', 'Earthwork detection', 'Vegetation structure', 'Flood modeling'],
        available: true,
        status: 'live',
      },
      {
        id: 'dem',
        name: 'Digital Elevation Model',
        abbr: 'DEM/DTM',
        description: 'High-resolution terrain surfaces. Hillshade, slope, aspect, curvature, and lineament analysis for site prospection and watershed modeling.',
        resolution: '1–30m',
        source: 'SRTM, Copernicus DEM, USGS 3DEP',
        wavelength: 'Radar / Optical stereo',
        use: ['Terrain analysis', 'Watershed modeling', 'Site prospection', 'Archaeological survey'],
        available: true,
        status: 'live',
      },
    ]
  },
  {
    id: 'thermal',
    label: 'THERMAL & INFRARED',
    icon: Thermometer,
    accent: '#f87171',
    layers: [
      {
        id: 'thermal_ir',
        name: 'Thermal Infrared',
        abbr: 'TIR',
        description: 'Emitted thermal radiation (8–14μm) via Landsat TIRS, MODIS, VIIRS, and ECOSTRESS reveals land surface temperature, subsurface heat anomalies, and thermal inertia differences.',
        resolution: '30–100m',
        source: 'Landsat-9 TIRS, ECOSTRESS, MODIS, VIIRS',
        wavelength: 'TIR 8–14μm',
        use: ['Subsurface anomalies', 'Soil moisture', 'Geothermal activity', 'Urban heat islands'],
        available: true,
        status: 'live',
      },
      {
        id: 'gas',
        name: 'Atmospheric / Gas Imaging',
        abbr: 'GHG',
        description: 'Sentinel-5P TROPOMI detects NO₂, methane, CO₂, aerosols, and plume work at parts-per-billion sensitivity. Critical for wetland carbon flux and contamination plume mapping.',
        resolution: '3.5km–30m',
        source: 'Sentinel-5P TROPOMI, NASA EMIT, Carbon Mapper',
        wavelength: 'SWIR 1600–2300nm',
        use: ['Methane plumes', 'CO₂ flux', 'Contamination mapping', 'Wetland carbon'],
        available: false,
        status: 'coming',
      },
    ]
  },
  {
    id: 'geophysical',
    label: 'GEOPHYSICAL',
    icon: Atom,
    accent: '#a78bfa',
    layers: [
      {
        id: 'magnetics',
        name: 'Magnetometry',
        abbr: 'MAG',
        description: 'ESA Swarm satellite + NOAA World Magnetic Model (WMM2025, valid through 2029) provide global magnetic field data. Ground survey achieves sub-nanoTesla sensitivity for buried features.',
        resolution: '0.1–1m (ground) / 50–200m (Swarm)',
        source: 'ESA Swarm, NOAA WMM, EMAG2, Ground survey',
        wavelength: 'DC field (nT)',
        use: ['Buried features', 'Archaeological prospection', 'Geological mapping', 'UXO detection'],
        available: false,
        status: 'field',
      },
      {
        id: 'gravity',
        name: 'Gravity Mapping',
        abbr: 'GRAV',
        description: 'GRACE-FO, GOCE, and NOAA/NASA products reveal density contrasts — voids, intrusions, and sediment thickness all produce measurable gravity signatures.',
        resolution: '1–10km (satellite)',
        source: 'GRACE-FO, GOCE, EGM2008, NOAA/NASA',
        wavelength: 'DC field (mGal)',
        use: ['Void detection', 'Sediment thickness', 'Geological structure', 'Subsidence risk'],
        available: false,
        status: 'coming',
      },
      {
        id: 'radon',
        name: 'Radon / Soil Gas',
        abbr: 'Rn',
        description: 'Radon emanation correlates with faults, permeable zones, and uranium-bearing geology. Field-deployable alpha-track detectors map subsurface gas flux.',
        resolution: 'Point / Grid',
        source: 'Field deployment (Rad7, AlphaGuard)',
        wavelength: 'Alpha decay (MeV)',
        use: ['Fault mapping', 'Structural geology', 'Site characterization', 'Health assessment'],
        available: false,
        status: 'field',
      },
    ]
  },
  {
    id: 'water',
    label: 'BATHYMETRIC & WATER',
    icon: Droplets,
    accent: '#06b6d4',
    layers: [
      {
        id: 'bathymetry',
        name: 'Bathymetric Imaging',
        abbr: 'BATHY',
        description: 'NOAA NCEI multibeam, singlebeam, LiDAR, and crowdsourced bathymetry. NOAA Coastal LiDAR Archive for topo-bathy fusion. ICESat-2 for satellite-derived shallow water bathymetry.',
        resolution: '1–30m (optical/LiDAR) / 50m (multibeam)',
        source: 'NOAA NCEI, ICESat-2, NOAA Coastal LiDAR Archive',
        wavelength: 'Blue-green 450–570nm / Acoustic',
        use: ['Submerged archaeology', 'Wetland morphology', 'Sediment mapping', 'Habitat classification'],
        available: false,
        status: 'coming',
      },
    ]
  },
  {
    id: 'experimental',
    label: 'EXPERIMENTAL',
    icon: Zap,
    accent: '#e879f9',
    layers: [
      {
        id: 'quantum',
        name: 'Quantum Sensing',
        abbr: 'QS',
        description: 'Atom interferometry and SQUID magnetometers achieve sensitivities orders of magnitude beyond classical instruments. Sub-picotesla magnetic resolution. Not yet core pipeline — research integration planned.',
        resolution: 'Sub-centimeter sensitivity',
        source: 'Experimental (M-SQUARED, ColdQuanta)',
        wavelength: 'Quantum coherence states',
        use: ['Ultra-deep prospection', 'Gravity gradiometry', 'Magnetic anomaly at depth', 'Research'],
        available: false,
        status: 'research',
      },
      {
        id: 'radio_astronomy',
        name: 'Radio Astronomy Imaging',
        abbr: 'RA',
        description: 'LOFAR, VLA, ALMA aperture synthesis. SKA and VLBI achieve microarcsecond angular resolution. Public data releases available. More sky-map than location intelligence — experimental integration.',
        resolution: 'Microarcseconds (VLBI)',
        source: 'LOFAR, ASKAP, VLA, ALMA public releases',
        wavelength: 'Radio 1mm–30m',
        use: ['Ionospheric monitoring', 'Research', 'Cosmic archaeology'],
        available: false,
        status: 'research',
      },
    ]
  },
]

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  live:       { label: 'LIVE',       color: '#4ade80', bg: 'rgba(74,222,128,0.08)' },
  processing: { label: 'PROCESSING', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)' },
  coming:     { label: 'COMING',     color: '#38bdf8', bg: 'rgba(56,189,248,0.08)' },
  field:      { label: 'FIELD OPS',  color: '#fb923c', bg: 'rgba(251,146,60,0.08)' },
  research:   { label: 'RESEARCH',   color: '#e879f9', bg: 'rgba(232,121,249,0.08)' },
}

export default function DataLayersPage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [activeLayer, setActiveLayer] = useState<string | null>(null)
  const [enabled, setEnabled] = useState<Set<string>>(new Set(['sar', 'insar', 'lidar', 'multispectral', 'hyperspectral', 'thermal_ir', 'dem']))

  const toggleLayer = (id: string) => {
    setEnabled(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selected = LAYER_CATEGORIES.flatMap(c => c.layers).find(l => l.id === activeLayer)
  const selectedCat = LAYER_CATEGORIES.find(c => c.layers.some(l => l.id === activeLayer))

  return (
    <div className="min-min-h-screen bg-[#0a0e0b] flex flex-col">
      <div className="px-8 pt-8 pb-6 border-b border-[#1a2a1e]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-6 h-px bg-[#5b7c6f]" />
          <span className="text-[#5b7c6f] text-[10px] tracking-[0.3em] font-light">INTELLIGENCE STACK</span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-light text-[#e8e4da] tracking-wide">Data Layers</h1>
            <p className="text-[#3a4a3e] text-sm font-light mt-1">
              {LAYER_CATEGORIES.reduce((a, c) => a + c.layers.length, 0)} modalities · {enabled.size} active · STAC-indexed
            </p>
          </div>
          <div className="flex items-center gap-4 md:p-6">
            {(['live','processing','field','coming','research'] as const).map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_STYLES[s].color }} />
                <span className="text-[#3a4a3e] text-[9px] tracking-widest font-light">{STATUS_STYLES[s].label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-full md:w-80 border-r border-[#1a2a1e] overflow-y-auto">
          {LAYER_CATEGORIES.map(cat => {
            const CatIcon = cat.icon
            return (
              <div key={cat.id}>
                <button
                  onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                  className="w-full flex items-center justify-between px-5 py-3.5 border-b border-[#1a2a1e] hover:bg-[#0d1410] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <CatIcon size={12} style={{ color: cat.accent }} />
                    <span className="text-[#7a8a7d] text-[9px] tracking-[0.25em] font-light">{cat.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[#2a3d2e] text-[9px] font-light">{cat.layers.filter(l => enabled.has(l.id)).length}/{cat.layers.length}</span>
                    <ChevronRight size={10} className={`text-[#2a3d2e] transition-transform ${activeCategory === cat.id ? 'rotate-90' : ''}`} />
                  </div>
                </button>

                {(activeCategory === cat.id || activeCategory === null) && cat.layers.map(layer => {
                  const st = STATUS_STYLES[layer.status]
                  const isActive = activeLayer === layer.id
                  const isOn = enabled.has(layer.id)
                  return (
                    <button
                      key={layer.id}
                      onClick={() => setActiveLayer(isActive ? null : layer.id)}
                      className={`w-full flex items-center justify-between px-5 py-3.5 border-b border-[#111a14] transition-all text-left ${isActive ? 'bg-[#111a14]' : 'hover:bg-[#0d1410]'}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          onClick={e => { e.stopPropagation(); if (layer.available) toggleLayer(layer.id) }}
                          className={`w-2 h-2 rounded-full flex-shrink-0 transition-all ${layer.available ? 'cursor-pointer' : 'cursor-not-allowed opacity-30'}`}
                          style={{ background: isOn && layer.available ? cat.accent : '#1a2a1e', boxShadow: isOn && layer.available ? `0 0 6px ${cat.accent}60` : 'none' }}
                        />
                        <div className="min-w-0">
                          <p className={`text-xs font-light tracking-wide truncate transition-colors ${isActive ? 'text-[#e8e4da]' : 'text-[#7a8a7d]'}`}>{layer.name}</p>
                          <p className="text-[#3a4a3e] text-[9px] font-light">{layer.abbr}</p>
                        </div>
                      </div>
                      <div className="flex-shrink-0 px-1.5 py-0.5 text-[8px] tracking-widest font-light ml-2" style={{ color: st.color, background: st.bg }}>
                        {st.label}
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto">
          {selected && selectedCat ? (
            <div className="p-4 md:p-8 max-w-3xl">
              <div className="flex items-start justify-between mb-8">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-4 h-px" style={{ background: selectedCat.accent }} />
                    <span className="text-[9px] tracking-[0.3em] font-light" style={{ color: selectedCat.accent }}>{selectedCat.label}</span>
                  </div>
                  <h2 className="text-2xl font-light text-[#e8e4da] tracking-wide mb-1">{selected.name}</h2>
                  <p className="text-[#3a4a3e] text-xs font-light tracking-widest">{selected.abbr}</p>
                </div>
                {selected.available && (
                  <button
                    onClick={() => toggleLayer(selected.id)}
                    className="flex items-center gap-2 px-4 py-2 border text-xs font-light tracking-wide transition-all"
                    style={enabled.has(selected.id)
                      ? { borderColor: selectedCat.accent, color: selectedCat.accent, background: `${selectedCat.accent}10` }
                      : { borderColor: '#1a2a1e', color: '#3a4a3e' }}
                  >
                    {enabled.has(selected.id) ? <Eye size={11} /> : <EyeOff size={11} />}
                    {enabled.has(selected.id) ? 'Active' : 'Enable'}
                  </button>
                )}
              </div>

              <p className="text-[#a8a49c] text-sm font-light leading-relaxed mb-8 border-l-2 border-[#1a2a1e] pl-5">{selected.description}</p>

              <div className="grid grid-cols-1 md:grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-[#1a2a1e] mb-8">
                {[
                  { label: 'RESOLUTION', value: selected.resolution },
                  { label: 'WAVELENGTH', value: selected.wavelength },
                  { label: 'SOURCE', value: selected.source },
                ].map(spec => (
                  <div key={spec.label} className="bg-[#0d1410] px-5 py-4">
                    <p className="text-[#3a4a3e] text-[9px] tracking-[0.2em] font-light mb-2">{spec.label}</p>
                    <p className="text-[#c8c4ba] text-xs font-light leading-snug">{spec.value}</p>
                  </div>
                ))}
              </div>

              <div className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-4 h-px" style={{ background: selectedCat.accent }} />
                  <span className="text-[9px] tracking-[0.25em] font-light" style={{ color: selectedCat.accent }}>APPLICATIONS</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[#1a2a1e]">
                  {selected.use.map(u => (
                    <div key={u} className="bg-[#0d1410] px-4 py-3 flex items-center gap-3">
                      <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: selectedCat.accent }} />
                      <p className="text-[#7a8a7d] text-xs font-light">{u}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-[#1a2a1e] px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_STYLES[selected.status].color }} />
                  <span className="text-xs font-light text-[#7a8a7d]">
                    {selected.status === 'live' && 'Available — toggle on to activate in globe view'}
                    {selected.status === 'processing' && 'Data acquired — processing pipeline running'}
                    {selected.status === 'coming' && 'Scheduled for integration — Q3 2025'}
                    {selected.status === 'field' && 'Requires field instrument deployment'}
                    {selected.status === 'research' && 'Experimental — MSIGI research integration planned'}
                  </span>
                </div>
                {selected.available && (
                  <button className="flex items-center gap-2 text-[#3a4a3e] hover:text-[#5b7c6f] transition-colors text-xs font-light">
                    <Download size={11} />
                    Export Layer
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-12">
              <Satellite size={32} className="text-[#1a2a1e] mb-6" />
              <p className="text-[#3a4a3e] text-sm font-light mb-2">Select a layer to inspect</p>
              <p className="text-[#2a3a2e] text-xs font-light max-w-xs">{enabled.size} active layers feeding the globe · Toggle to enable or disable</p>
            </div>
          )}
        </div>

        <div className="w-full md:w-56 border-l border-[#1a2a1e] p-4 overflow-y-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-px bg-[#5b7c6f]" />
            <span className="text-[#3a4a3e] text-[9px] tracking-widest font-light">ACTIVE STACK</span>
          </div>
          <div className="space-y-px">
            {LAYER_CATEGORIES.flatMap(cat =>
              cat.layers.filter(l => enabled.has(l.id)).map(layer => (
                <div key={layer.id} className="flex items-center gap-2 py-2 px-3 bg-[#0d1410]">
                  <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: cat.accent }} />
                  <span className="text-[#7a8a7d] text-[10px] font-light truncate">{layer.abbr}</span>
                </div>
              ))
            )}
            {enabled.size === 0 && <p className="text-[#2a3a2e] text-[10px] font-light px-3 py-4">No layers active</p>}
          </div>
          <div className="mt-6 border-t border-[#1a2a1e] pt-4">
            <a href="/portal/globe" className="block w-full text-center py-2.5 border border-[#1a2a1e] hover:border-[#5b7c6f] text-[#5b7c6f] text-[10px] tracking-widest font-light transition-colors">
              OPEN GLOBE →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
