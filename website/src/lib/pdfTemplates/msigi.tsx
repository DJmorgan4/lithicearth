import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

const BLUE  = '#2F5D8C'
const TEAL  = '#4F7A6A'
const INK   = '#111A24'
const MUTED = '#64748B'
const LIGHT = '#F8F9FA'
const BORDER= '#E2E8F0'

const styles = StyleSheet.create({
  page:        { fontFamily:'Helvetica', backgroundColor:'#FFFFFF', paddingBottom:60 },
  cover:       { backgroundColor:INK, height:'100%', padding:0 },
  coverTop:    { padding:'56px 56px 32px' },
  coverMid:    { padding:'32px 56px', flex:1 },
  coverBottom: { padding:'28px 56px', borderTop:'1px solid rgba(255,255,255,0.15)' },
  coverLabel:  { fontSize:7, letterSpacing:2, color:'rgba(255,255,255,0.45)', textTransform:'uppercase', marginBottom:6 },
  coverTitle:  { fontSize:26, color:'#FFFFFF', fontFamily:'Helvetica-Bold', lineHeight:1.25, marginBottom:8 },
  coverSub:    { fontSize:10, color:'rgba(255,255,255,0.65)', lineHeight:1.6 },
  coverMeta:   { fontSize:8.5, color:'rgba(255,255,255,0.5)', marginBottom:4 },
  header:      { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:44, paddingVertical:12, borderBottom:`1px solid ${BORDER}`, backgroundColor:'#FAFBFC' },
  headerL:     { fontSize:8.5, color:MUTED },
  headerR:     { fontSize:8.5, color:MUTED },
  body:        { paddingHorizontal:44, paddingTop:24 },
  secHead:     { fontSize:7, letterSpacing:2, color:MUTED, textTransform:'uppercase', marginBottom:10, paddingBottom:6, borderBottom:`1px solid ${BORDER}` },
  h3:          { fontSize:11, color:INK, fontFamily:'Helvetica-Bold', marginBottom:5, marginTop:14 },
  p:           { fontSize:9.5, color:INK, lineHeight:1.65, marginBottom:8 },
  muted:       { fontSize:8.5, color:MUTED, lineHeight:1.5, marginBottom:6 },
  row:         { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:7, borderBottom:`1px solid ${BORDER}` },
  rowLabel:    { fontSize:9.5, color:INK },
  rowVal:      { fontSize:9.5, color:BLUE, fontFamily:'Helvetica-Bold' },
  tableHead:   { flexDirection:'row', backgroundColor:LIGHT, paddingVertical:6, paddingHorizontal:10, borderBottom:`1px solid ${BORDER}` },
  tableRow:    { flexDirection:'row', paddingVertical:7, paddingHorizontal:10, borderBottom:`1px solid ${BORDER}` },
  cell:        { fontSize:8.5, color:INK, flex:1 },
  cellM:       { fontSize:8, color:MUTED, flex:1 },
  cellH:       { fontSize:7.5, color:MUTED, flex:1, textTransform:'uppercase', letterSpacing:0.8 },
  scoreBox:    { backgroundColor:BLUE, borderRadius:4, padding:'14px 18px', marginBottom:14, flexDirection:'row', alignItems:'center', gap:20 },
  scoreNum:    { fontSize:42, color:'#FFFFFF', fontFamily:'Helvetica-Bold' },
  scoreMeta:   { flex:1 },
  scoreBadge:  { fontSize:7.5, letterSpacing:1.5, color:'#FFFFFF', backgroundColor:'rgba(255,255,255,0.2)', padding:'2px 7px', borderRadius:2, marginBottom:5, alignSelf:'flex-start' },
  footer:      { position:'absolute', bottom:20, left:44, right:44, flexDirection:'row', justifyContent:'space-between', borderTop:`1px solid ${BORDER}`, paddingTop:8 },
  footerText:  { fontSize:7.5, color:MUTED },
  disclaimer:  { backgroundColor:LIGHT, border:`1px solid ${BORDER}`, borderRadius:3, padding:'10px 14px', marginTop:14 },
  disText:     { fontSize:7.5, color:MUTED, lineHeight:1.55 },
  mapImg:      { width:'100%', height:200, borderRadius:4, marginBottom:10 },
})

function Header({ title, date }: { title:string; date:string }) {
  return (
    <View style={styles.header} fixed>
      <Text style={styles.headerL}>LITHICEARTH MSIGI FIELD INTELLIGENCE REPORT · {title}</Text>
      <Text style={styles.headerR}>{date}</Text>
    </View>
  )
}

function Footer({ id }: { id:string }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>LithicEarth · MSIGI Methodology · The Blue Duck LLC · lithicearth.com</Text>
      <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages} · ${id}`} />
    </View>
  )
}

export interface MsigiPDFProps {
  lat: number
  lng: number
  location: string
  reportType: string
  activeLayers: string[]
  notes: string
  generated_at: string
  scan: {
    terrain?: { mean_elevation_m:number; std_elevation_m:number; elevated_point_count:number; source:string }
    spectral?: { ndvi_mean:number; cloud_cover:number; date:string }
    sar?: { platform:string; date:string; valid:boolean }
    muon_baseline?: { flux_m2_min:number; kp_index:number }
    candidates?: { id:string; score:number; dem_score:number; ndvi_score:number; sar_score:number; lat:number; lng:number }[]
  }
  astra_interpretation: string
}

export function MsigiPDF(props: MsigiPDFProps) {
  const { lat, lng, location, reportType, activeLayers, notes, generated_at, scan, astra_interpretation } = props
  const today = new Date(generated_at).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })
  const reportId = `LE-MSIGI-${new Date(generated_at).getFullYear()}-${Date.now().toString().slice(-6)}`
  const t = scan?.terrain
  const s = scan?.spectral
  const sar = scan?.sar
  const mu = scan?.muon_baseline
  const candidates = scan?.candidates || []
  const topScore = candidates[0]?.score ?? 0
  const ratingLabel = topScore >= 0.8 ? 'HIGH ANOMALY' : topScore >= 0.6 ? 'MODERATE ANOMALY' : topScore >= 0.4 ? 'LOW ANOMALY' : 'BASELINE'

  return (
    <Document title={`MSIGI Report — ${location}`} author="LithicEarth" creator="LithicEarth Portal">

      {/* COVER */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.cover}>
          <View style={styles.coverTop}>
            <Text style={styles.coverLabel}>LithicEarth · MSIGI Field Intelligence Report</Text>
            <Text style={styles.coverTitle}>{location || `${lat.toFixed(5)}°N, ${Math.abs(lng).toFixed(5)}°W`}</Text>
            <Text style={styles.coverSub}>Multi-Source Interferometric Ground Intelligence{'\n'}STRATUM · LOCUS · NEXUS · The Blue Duck LLC</Text>
          </View>
          <View style={{ height:1, backgroundColor:'rgba(255,255,255,0.15)', marginHorizontal:56 }}/>
          <View style={styles.coverMid}>
            <View style={{ flexDirection:'row', gap:32, marginBottom:28 }}>
              <View>
                <Text style={[styles.coverLabel, { marginBottom:4 }]}>TOP CANDIDATE SCORE</Text>
                <Text style={{ fontSize:48, color:'#FFFFFF', fontFamily:'Helvetica-Bold', lineHeight:1 }}>{(topScore*100).toFixed(0)}</Text>
                <Text style={{ fontSize:9, color:'rgba(255,255,255,0.5)', letterSpacing:1.5, marginTop:4 }}>/100 · {ratingLabel}</Text>
              </View>
              <View style={{ flex:1 }}>
                <Text style={[styles.coverLabel, { marginBottom:8 }]}>SCAN SUMMARY</Text>
                {t && <Text style={styles.coverMeta}>Elevation: {t.mean_elevation_m}m mean ±{t.std_elevation_m}m</Text>}
                {s && <Text style={styles.coverMeta}>NDVI: {s.ndvi_mean} · Cloud: {s.cloud_cover}%</Text>}
                {sar && <Text style={styles.coverMeta}>SAR: {sar.platform} · {sar.date}</Text>}
                {mu && <Text style={styles.coverMeta}>Muon: {mu.flux_m2_min}/m²/min · Kp {mu.kp_index}</Text>}
                <Text style={styles.coverMeta}>Candidates: {candidates.length} detected</Text>
              </View>
            </View>
            <View style={{ gap:5 }}>
              {[
                { label:'Coordinates', value:`${lat.toFixed(5)}°N, ${Math.abs(lng).toFixed(5)}°W` },
                { label:'Report Type', value:reportType },
                { label:'Active Layers', value:activeLayers.join(', ') || 'None' },
                { label:'Report Date', value:today },
                { label:'Report ID', value:reportId },
                { label:'Methodology', value:'MSIGI v1 · DBSCAN · Gaisser+NOAA_Kp' },
              ].map(({ label, value }) => (
                <View key={label} style={{ flexDirection:'row', gap:8 }}>
                  <Text style={[styles.coverMeta, { width:100 }]}>{label}:</Text>
                  <Text style={[styles.coverMeta, { color:'rgba(255,255,255,0.8)', flex:1 }]}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.coverBottom}>
            <Text style={styles.coverMeta}>Prepared by: DJ Morgan, EP-TX · LithicEarth · The Blue Duck LLC · McKinney, Texas</Text>
            <Text style={styles.coverMeta}>CAGE 14V05 · UEI LG15KPRZFQE3 · lithicearth.com</Text>
          </View>
        </View>
      </Page>

      {/* TERRAIN SCAN */}
      <Page size="LETTER" style={styles.page}>
        <Header title={location} date={today} />
        <View style={styles.body}>
          <Text style={styles.secHead}>Section 1 — Terrain Scan Results</Text>
          {[
            { label:'Mean Elevation', value: t ? `${t.mean_elevation_m}m MSL` : 'N/A' },
            { label:'Std Deviation', value: t ? `±${t.std_elevation_m}m` : 'N/A' },
            { label:'Elevated Points', value: t ? String(t.elevated_point_count) : 'N/A' },
            { label:'DEM Source', value: t?.source || 'USGS 3DEP WCS' },
            { label:'NDVI Mean', value: s ? String(s.ndvi_mean) : 'N/A' },
            { label:'Cloud Cover', value: s ? `${s.cloud_cover}%` : 'N/A' },
            { label:'Spectral Date', value: s?.date || 'N/A' },
            { label:'SAR Platform', value: sar?.platform || 'N/A' },
            { label:'SAR Date', value: sar?.date || 'N/A' },
            { label:'SAR Valid', value: sar?.valid ? 'Yes' : 'No' },
            { label:'Muon Flux', value: mu ? `${mu.flux_m2_min}/m²/min` : 'N/A' },
            { label:'Kp Index', value: mu ? String(mu.kp_index) : 'N/A' },
          ].map((r,i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={styles.rowVal}>{r.value}</Text>
            </View>
          ))}
        </View>
        <Footer id={reportId} />
      </Page>

      {/* CANDIDATES */}
      <Page size="LETTER" style={styles.page}>
        <Header title={location} date={today} />
        <View style={styles.body}>
          <Text style={styles.secHead}>Section 2 — Anomaly Candidates</Text>
          <Text style={[styles.muted, { marginBottom:10 }]}>
            DBSCAN clustering (eps=35m) applied to multi-source composite score: DEM×0.60 + NDVI×0.25 + SAR×0.15
          </Text>
          <View style={styles.tableHead}>
            <Text style={[styles.cellH, { flex:0.5 }]}>ID</Text>
            <Text style={[styles.cellH, { flex:0.8 }]}>Score</Text>
            <Text style={[styles.cellH, { flex:0.8 }]}>DEM</Text>
            <Text style={[styles.cellH, { flex:0.8 }]}>NDVI</Text>
            <Text style={[styles.cellH, { flex:0.8 }]}>SAR</Text>
            <Text style={[styles.cellH, { flex:1.5, textAlign:'right' }]}>Coordinates</Text>
          </View>
          {candidates.map((c,i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.cell, { flex:0.5 }]}>{c.id}</Text>
              <Text style={[styles.cell, { flex:0.8, color:BLUE, fontFamily:'Helvetica-Bold' }]}>{(c.score*100).toFixed(0)}</Text>
              <Text style={[styles.cellM, { flex:0.8 }]}>{c.dem_score?.toFixed(3)}</Text>
              <Text style={[styles.cellM, { flex:0.8 }]}>{c.ndvi_score?.toFixed(3)}</Text>
              <Text style={[styles.cellM, { flex:0.8 }]}>{c.sar_score?.toFixed(3)}</Text>
              <Text style={[styles.cellM, { flex:1.5, textAlign:'right' }]}>{c.lat?.toFixed(5)}, {c.lng?.toFixed(5)}</Text>
            </View>
          ))}
          {candidates.length === 0 && (
            <Text style={[styles.muted, { padding:16, textAlign:'center' }]}>No anomaly candidates detected in scan area.</Text>
          )}
        </View>
        <Footer id={reportId} />
      </Page>

      {/* ASTRA INTERPRETATION */}
      <Page size="LETTER" style={styles.page}>
        <Header title={location} date={today} />
        <View style={styles.body}>
          <Text style={styles.secHead}>Section 3 — ASTRA Core Layer Interpretation</Text>
          <Text style={[styles.muted, { marginBottom:12 }]}>
            ASTRA CORE intelligence layer analysis — 20-domain knowledge system · LOCUS reasoning · STRATUM indexed
          </Text>
          {astra_interpretation.split('\n').filter(l => l.trim()).map((line, i) => {
            const isHeader = line.match(/^#{1,3}\s/) || (line.match(/^[A-Z][A-Z\s\/—]{6,}:?\s*$/) && line.length < 70)
            if (isHeader) return <Text key={i} style={styles.h3}>{line.replace(/^#+\s*/,'').trim()}</Text>
            return <Text key={i} style={styles.p}>{line.trim()}</Text>
          })}
        </View>
        <Footer id={reportId} />
      </Page>

      {/* ANALYST NOTES + DISCLAIMER */}
      <Page size="LETTER" style={styles.page}>
        <Header title={location} date={today} />
        <View style={styles.body}>
          <Text style={styles.secHead}>Section 4 — Analyst Notes & Methodology</Text>
          {notes && (
            <>
              <Text style={styles.h3}>Analyst Notes</Text>
              <Text style={styles.p}>{notes}</Text>
            </>
          )}
          <Text style={styles.h3}>Active Data Layers</Text>
          {activeLayers.map((l,i) => <Text key={i} style={styles.p}>· {l}</Text>)}
          <Text style={styles.h3}>MSIGI Methodology</Text>
          <Text style={styles.p}>
            Multi-Source Interferometric Ground Intelligence (MSIGI) combines USGS 3DEP LiDAR terrain analysis, 
            Sentinel-2 multispectral imagery (NDVI, SWIR, moisture), Sentinel-1 SAR backscatter, and cosmic muon 
            flux baseline (Gaisser parameterization + live NOAA Kp index) into a composite anomaly score. 
            DBSCAN clustering (eps=35m, min_samples=2) identifies candidate locations. 
            Composite weight: DEM×0.60 + S2_NDVI×0.25 + S1_SAR×0.15.
          </Text>
          <View style={styles.disclaimer}>
            <Text style={[styles.disText, { fontFamily:'Helvetica-Bold', marginBottom:4 }]}>DISCLAIMER</Text>
            <Text style={styles.disText}>
              This MSIGI Field Intelligence Report was generated using the LithicEarth geospatial intelligence platform. 
              Remote sensing data is subject to atmospheric interference, temporal coverage gaps, and sensor limitations. 
              Anomaly candidates require field verification before drawing conclusions. This report is for intelligence 
              support only and does not constitute a Phase I ESA, archaeological survey, or professional engineering opinion. 
              Report ID: {reportId}.
            </Text>
          </View>
          <View style={{ marginTop:24, borderTop:`2px solid ${INK}`, paddingTop:14 }}>
            <Text style={{ fontSize:9, color:INK, fontFamily:'Helvetica-Bold', marginBottom:4 }}>Prepared By</Text>
            <Text style={{ fontSize:9, color:INK }}>DJ Morgan, EP-TX</Text>
            <Text style={{ fontSize:8.5, color:MUTED }}>LithicEarth · The Blue Duck LLC · McKinney, Texas</Text>
            <Text style={{ fontSize:8.5, color:MUTED }}>CAGE 14V05 · UEI LG15KPRZFQE3 · lithicearth.com</Text>
            <Text style={{ fontSize:8.5, color:MUTED, marginTop:4 }}>Generated: {today}</Text>
          </View>
        </View>
        <Footer id={reportId} />
      </Page>

    </Document>
  )
}
