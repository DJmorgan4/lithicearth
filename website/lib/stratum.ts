import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const stratum = createClient(supabaseUrl, supabaseKey)

// Fetch all sites for Cesium globe
export async function stratumGetAllSites() {
  const { data, error } = await stratum
    .from('stratum_sites')
    .select(`
      id,
      name,
      latitude,
      longitude,
      source,
      site_type,
      ceto_score,
      ceto_tier,
      esa_phase,
      status,
      tags,
      stratum_sensor_readings(sensor_type, value, unit, created_at),
      stratum_observations(observation_type, notes, created_at),
      stratum_documents(doc_type, title, url)
    `)
    .eq('status', 'active')

  if (error) throw error
  return data
}

// Fetch single site with full detail
export async function stratumGetSite(id: string) {
  const { data, error } = await stratum
    .from('stratum_sites')
    .select(`
      *,
      stratum_sensor_readings(*),
      stratum_observations(*),
      stratum_documents(*)
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}
