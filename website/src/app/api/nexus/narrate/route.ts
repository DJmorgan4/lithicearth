 
 
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { lat, lng, layers, readout } = await req.json()

    const prompt = `You are ASTRA NEXUS — the spatial intelligence layer of LithicEarth.

A user has clicked coordinates ${lat}°N, ${lng}°E on the globe.

Available sensor data at this point:
${readout?.elevation ? `- Elevation: ${readout.elevation} ft (USGS 3DEP)` : ''}
${readout?.ndvi ? `- NDVI: ${readout.ndvi} (Sentinel-2 vegetation index)` : ''}
${readout?.sarVV ? `- SAR backscatter: ${readout.sarVV} dB (Sentinel-1)` : ''}
${readout?.magnetic ? `- Magnetic anomaly: ${readout.magnetic} nT` : ''}
${readout?.geology ? `- Geology: ${readout.geology}` : ''}
${readout?.soil ? `- Soil type: ${readout.soil}` : ''}

Active layers: ${layers?.filter((l: { active: boolean }) => l.active).map((l: { label: string }) => l.label).join(', ') || 'terrain, satellite'}

In 2-3 sentences, narrate what is geospatially significant about this location.
Identify any convergence patterns. Flag if this location warrants ground-truth investigation.
Be direct and technical. Lead with the most significant finding.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data = await response.json()
    const text = data.content?.[0]?.text || 'ASTRA analysis unavailable'
    return NextResponse.json({ narration: text, lat, lng })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
