 
 
import { createClient } from '@/lib/supabase/server'
import { uploadToR2, r2Paths } from '@/lib/r2'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Validate type
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
  }

  // Max 20MB
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const path = r2Paths.photo(user.id, file.name.replace(/[^a-zA-Z0-9._-]/g, '_'))

  const url = await uploadToR2(path, buffer, file.type)

  return NextResponse.json({ url, path })
}
