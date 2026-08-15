'use client'

import dynamic from 'next/dynamic'

const LithicEarthViewer = dynamic(
  () => import('@/components/earth/LithicEarthViewer'),
  { ssr: false }
)

export default function ExploreClient() {
  return <LithicEarthViewer />
}


