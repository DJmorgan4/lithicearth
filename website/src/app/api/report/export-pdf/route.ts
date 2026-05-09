import { NextRequest, NextResponse } from 'next/server'
import ReactPDF from '@react-pdf/renderer'
import React from 'react'
import { MsigiPDF } from '@/lib/pdfTemplates/msigi'

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const element = React.createElement(MsigiPDF, data)
    const stream = await ReactPDF.renderToStream(element as any)
    const chunks: Buffer[] = []
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const pdf = Buffer.concat(chunks)
    const filename = `LithicEarth_MSIGI_${data.lat}_${data.lng}_${new Date().toISOString().slice(0,10)}.pdf`
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdf.length.toString(),
      },
    })
  } catch (e) {
    console.error('MSIGI PDF error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
