import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

const BADGE_RULES = [
  { key: "first_photo",  check: (s: any, posts: any[]) => posts.length >= 1 },
  { key: "photos_10",    check: (s: any, posts: any[]) => posts.length >= 10 },
  { key: "photos_50",    check: (s: any, posts: any[]) => posts.length >= 50 },
  { key: "photos_100",   check: (s: any, posts: any[]) => posts.length >= 100 },
  { key: "streak_7",     check: (s: any) => s?.current_streak >= 7 },
  { key: "streak_30",    check: (s: any) => s?.current_streak >= 30 },
  { key: "streak_100",   check: (s: any) => s?.current_streak >= 100 },
  { key: "accuracy_80",  check: (s: any) => s?.total_attempted >= 20 && (s.total_correct / s.total_attempted) >= 0.8 },
  { key: "wetland",      check: (s: any, posts: any[]) => posts.filter((p: any) => p.category?.toLowerCase() === "hydrology").length >= 5 },
  { key: "sacred",       check: (s: any, posts: any[]) => posts.some((p: any) => p.category?.toLowerCase() === "archaeology") },
]

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const [streakRes, postsRes, profileRes] = await Promise.all([
      supabase.from("user_streaks").select("*").eq("user_id", user.id).single(),
      supabase.from("posts").select("category").eq("user_id", user.id),
      supabase.from("profiles").select("badges").eq("id", user.id).single(),
    ])

    const streak = streakRes.data
    const posts = postsRes.data || []
    const currentBadges: string[] = profileRes.data?.badges || []
    const newBadges: string[] = []

    for (const rule of BADGE_RULES) {
      if (!currentBadges.includes(rule.key) && rule.check(streak, posts)) {
        newBadges.push(rule.key)
      }
    }

    if (newBadges.length > 0) {
      await supabase.from("profiles")
        .update({ badges: [...currentBadges, ...newBadges] })
        .eq("id", user.id)
    }

    return NextResponse.json({ awarded: newBadges, total: currentBadges.length + newBadges.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
