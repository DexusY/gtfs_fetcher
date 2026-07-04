import { useEffect, useRef, useState } from 'react'
import { getStops } from '../api'
import type { Stop } from '../api'

export type StopsPhase = 'idle' | 'loading' | 'ready' | 'error'

export function useStops(regionId: string) {
  const [stops, setStops]     = useState<Stop[]>([])
  const [phase, setPhase]     = useState<StopsPhase>('idle')
  const [message, setMessage] = useState('')
  const cancelRef = useRef(false)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!regionId) {
      setStops([])
      setPhase('idle')
      setMessage('')
      return
    }

    cancelRef.current = false
    setStops([])
    setPhase('loading')
    setMessage('Loading stops…')

    const attempt = async (first = true) => {
      if (cancelRef.current) return
      try {
        const data = await getStops(regionId)
        if (cancelRef.current) return
        if (data.length > 0) {
          setStops(data)
          setPhase('ready')
          setMessage('')
        } else {
          if (first) setMessage('Downloading GTFS data, please wait…')
          timerRef.current = setTimeout(() => attempt(false), 3000)
        }
      } catch {
        if (!cancelRef.current) {
          setPhase('error')
          setMessage('Failed to load stops — check network or GTFS URL')
        }
      }
    }

    attempt()
    return () => {
      cancelRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [regionId])

  return { stops, phase, message }
}
