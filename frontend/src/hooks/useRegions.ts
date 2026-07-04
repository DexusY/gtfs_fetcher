import { useCallback, useEffect, useRef, useState } from 'react'
import { getRegions, getRegionsStatus } from '../api'
import type { Region, RegionStatus } from '../api'

export function useRegions() {
  const [regions, setRegions]     = useState<Region[]>([])
  const [statuses, setStatuses]   = useState<Record<string, RegionStatus>>({})
  const [loading, setLoading]     = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refreshStatus = useCallback(() =>
    getRegionsStatus().then(s => setStatuses(s)),
    []
  )

  useEffect(() => {
    Promise.all([getRegions(), getRegionsStatus()])
      .then(([r, s]) => { setRegions(r); setStatuses(s) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    const anyWarming = Object.values(statuses).some(v => v.status === 'warming')
    if (!anyWarming || loading) return
    pollRef.current = setInterval(refreshStatus, 4000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [statuses, loading, refreshStatus])

  // Back-compat surface: cacheStatus[id] returns the string status.
  const cacheStatus: Record<string, RegionStatus['status']> = Object.fromEntries(
    Object.entries(statuses).map(([k, v]) => [k, v.status])
  )

  return { regions, statuses, cacheStatus, loading, refreshStatus }
}
