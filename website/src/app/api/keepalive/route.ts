import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  // lightweight query — touches the DB so Supabase counts it as activity
  const { error } = await supabase.from('profiles').select('id').limit(1)
  return NextResponse.json({ ok: !error, ts: new Date().toISOString() })
}
