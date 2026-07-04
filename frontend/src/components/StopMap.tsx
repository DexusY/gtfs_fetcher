import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTheme } from '../theme/ThemeProvider'

interface Stop { id: string; name: string; lat: number; lon: number }

interface Props {
  stops: Stop[]
  selectedId: string
  onSelect: (stop: Stop) => void
  city?: string
  country?: string
}

async function fetchCityBoundary(city: string, country: string): Promise<L.LatLng[][] | null> {
  try {
    const search = await fetch(
      `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&format=json&limit=1&polygon_geojson=1`,
      { headers: { 'Accept-Language': 'en' } }
    )
    const results = await search.json()
    if (!results.length) return null
    const geo = results[0].geojson
    if (!geo) return null

    const toRings = (coords: number[][][]): L.LatLng[][] =>
      coords.map(ring => ring.map(([lon, lat]) => L.latLng(lat, lon)))

    if (geo.type === 'Polygon') return toRings(geo.coordinates)
    if (geo.type === 'MultiPolygon')
      return geo.coordinates.flatMap((poly: number[][][]) => toRings(poly))
    return null
  } catch {
    return null
  }
}

// Resolve theme tokens to actual rgb strings at call time (so dark/light both work)
function tokenRgb(varName: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return v ? `rgb(${v})` : '#000'
}

interface MarkerColors { brand: string; fg: string; surface: string }

function markerStyle(isSelected: boolean, c: MarkerColors) {
  return {
    radius:      isSelected ? 9 : 4.5,
    fillColor:   isSelected ? c.brand : c.fg,
    color:       c.surface,
    weight:      isSelected ? 2.5 : 1.5,
    fillOpacity: isSelected ? 1 : 0.9,
  }
}

function applyMarkerStyle(m: L.CircleMarker, isSelected: boolean, c: MarkerColors) {
  const s = markerStyle(isSelected, c)
  m.setStyle({ fillColor: s.fillColor, color: s.color, weight: s.weight, fillOpacity: s.fillOpacity })
  m.setRadius(s.radius)
}

export default function StopMap({ stops, selectedId, onSelect, city, country }: Props) {
  const { theme } = useTheme()
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<L.Map | null>(null)
  const stopsLayerRef = useRef<L.LayerGroup | null>(null)
  const boundaryRef   = useRef<L.Polyline | null>(null)
  const prevCityRef   = useRef('')
  const markersRef    = useRef<Map<string, L.CircleMarker>>(new Map())
  const prevSelRef    = useRef('')
  const onSelectRef   = useRef(onSelect); onSelectRef.current = onSelect

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    mapRef.current = L.map(containerRef.current, { zoomControl: true }).setView([52, 19], 6)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(mapRef.current)
    stopsLayerRef.current = L.layerGroup().addTo(mapRef.current)
    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [])

  // City boundary
  useEffect(() => {
    const map = mapRef.current
    if (!map || !city || !country) return
    const key = `${city}|${country}|${theme}`
    if (prevCityRef.current === key) return
    prevCityRef.current = key

    boundaryRef.current?.remove()
    boundaryRef.current = null

    fetchCityBoundary(city, country).then(rings => {
      if (!rings || !mapRef.current) return
      const poly = L.polyline(rings, {
        color: tokenRgb('--c-fg-muted'),
        weight: 1.2,
        opacity: 0.55,
        dashArray: '4 4',
      }).addTo(mapRef.current)
      boundaryRef.current = poly
    })
  }, [city, country, theme])

  // Build markers once per stops/theme. Selection styling is handled separately
  // so picking a stop doesn't tear down and rebuild the whole layer.
  useEffect(() => {
    const map   = mapRef.current
    const layer = stopsLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()
    markersRef.current.clear()
    if (!stops.length) return

    const c: MarkerColors = { brand: tokenRgb('--c-brand'), fg: tokenRgb('--c-fg'), surface: tokenRgb('--c-surface') }
    const fgSub = tokenRgb('--c-fg-subtle')

    stops.forEach(stop => {
      const marker = L.circleMarker([stop.lat, stop.lon], markerStyle(stop.id === selectedId, c))

      marker.bindPopup(
        `<div style="min-width:160px;font-family:'Geist',system-ui,sans-serif">
          <div style="font-weight:600;font-size:13px;color:${c.fg};margin-bottom:4px;letter-spacing:-0.012em">${stop.name}</div>
          <div style="color:${fgSub};font-size:10px;text-transform:uppercase;letter-spacing:0.08em;font-family:'Geist Mono',monospace">ID · ${stop.id}</div>
          <div style="color:${c.brand};font-size:11px;margin-top:8px;font-weight:500">→ click to select</div>
        </div>`,
        { closeButton: false, offset: [0, -4] }
      )

      marker.on('click', () => { onSelectRef.current(stop); marker.closePopup() })
      marker.on('mouseover', () => marker.openPopup())
      marker.on('mouseout',  () => marker.closePopup())

      layer.addLayer(marker)
      markersRef.current.set(stop.id, marker)
    })
    prevSelRef.current = selectedId

    if (selectedId === '') {
      const bounds = L.latLngBounds(stops.map(s => [s.lat, s.lon]))
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 })
    }
    // selectedId intentionally excluded — selection restyle lives in the next effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, theme])

  // Restyle only the previously- and newly-selected markers on selection change.
  useEffect(() => {
    const m = markersRef.current
    if (!m.size) return
    const c: MarkerColors = { brand: tokenRgb('--c-brand'), fg: tokenRgb('--c-fg'), surface: tokenRgb('--c-surface') }
    const prev = prevSelRef.current
    if (prev && prev !== selectedId) {
      const pm = m.get(prev)
      if (pm) applyMarkerStyle(pm, false, c)
    }
    const sel = m.get(selectedId)
    if (sel) { applyMarkerStyle(sel, true, c); sel.bringToFront() }
    prevSelRef.current = selectedId
  }, [selectedId])

  // Pan to selection
  useEffect(() => {
    if (!selectedId || !mapRef.current) return
    const stop = stops.find(s => s.id === selectedId)
    if (stop) mapRef.current.setView([stop.lat, stop.lon], Math.max(mapRef.current.getZoom(), 15), { animate: true })
  }, [selectedId])

  return (
    <div
      ref={containerRef}
      className="w-full h-[420px]"
      role="application"
      aria-label={stops.length ? `Interactive map — ${stops.length} stops loaded` : 'Interactive map — no stops loaded'}
      tabIndex={0}
    />
  )
}
