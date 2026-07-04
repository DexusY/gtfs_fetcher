import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRole } from '../auth'
import Shell from '../components/shell/Shell'
import StopMap from '../components/StopMap'
import CustomLayoutEditor from '../components/CustomLayoutEditor'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Segmented from '../components/ui/Segmented'
import { Card, CardHeader } from '../components/ui/Card'
import { Skeleton } from '../components/ui/Skeleton'
import { useRegions } from '../hooks/useRegions'
import { useStops } from '../hooks/useStops'
import { renderDefault, renderCustom } from '../api'
import type { Stop } from '../api'

const LANGUAGES = ['pl', 'en', 'de'] as const
const FORMATS   = ['png', 'jpg', 'epd', 'lz4'] as const

// Human labels for backend template keys + format identifiers, so the UI speaks
// the operator's language instead of leaking internal names.
const TEMPLATE_LABELS: Record<string, string> = {
  rti_display: 'Real-time departures',
  gtfs_routes_map: 'Routes map',
}
// Short label (acronym + plain word) for the picker; longer hint explains the choice.
const FORMAT_LABELS: Record<string, string> = {
  png: 'PNG · image',
  jpg: 'JPG · image',
  epd: 'EPD · e-paper',
  lz4: 'LZ4 · e-paper',
}
const FORMAT_HINTS: Record<string, string> = {
  png: 'Sharp, lossless image — best for preview and most screens.',
  jpg: 'Smaller image, slight quality loss.',
  epd: 'Raw buffer for e-paper panels.',
  lz4: 'Compressed e-paper buffer — smaller payload.',
}

// While typing, keep the previous value on NaN and cap the max; the minimum is
// enforced on blur so intermediate digits below it stay editable.
function typedNum(raw: string, prev: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return prev
  return Math.min(max, Math.max(0, Math.round(n)))
}

export default function Dashboard() {
  const { regions, statuses, cacheStatus, loading: regionsLoading, refreshStatus } = useRegions()

  const nav     = useNavigate()
  const isAdmin = getRole() === 'admin'
  const [showHint, setShowHint] = useState(() => {
    try { return localStorage.getItem('gtfs-onboard-dismissed') !== '1' } catch { return true }
  })
  const dismissHint = useCallback(() => {
    setShowHint(false)
    try { localStorage.setItem('gtfs-onboard-dismissed', '1') } catch { /* ignore */ }
  }, [])

  const [regionId, setRegionId] = useState('')
  const { stops, phase: stopsPhase, message: stopsMessage } = useStops(regionId)

  const [stopId, setStopId]       = useState('')
  const [stopName, setStopName]   = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [activeIdx, setActiveIdx]     = useState(0)
  const searchRef = useRef<HTMLDivElement>(null)
  const [width, setWidth]         = useState(1600)
  const [height, setHeight]       = useState(1200)
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape')
  const [lang, setLang]           = useState('pl')
  const [limit, setLimit]         = useState(10)
  const [format, setFormat]       = useState('png')
  const [previewUrl, setPreviewUrl] = useState('')
  const [imgLoading, setImgLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const [templateKind, setTemplateKind]     = useState<'departures' | 'routes'>('departures')
  const [templateSource, setTemplateSource] = useState<'default' | 'custom'>('default')
  const [bgFile, setBgFile]             = useState<File | null>(null)
  const [bgDragOver, setBgDragOver]     = useState(false)
  const [customLayout, setCustomLayout] = useState<object>({ fields: [] })
  const [renderError, setRenderError]   = useState('')
  const prevBlobUrl = useRef<string | null>(null)

  useEffect(() => {
    if (stopsPhase === 'ready') refreshStatus()
  }, [stopsPhase, refreshStatus])

  const regionHasShapes = regionId ? statuses[regionId]?.has_shapes ?? null : null
  // Auto-snap off Routes when the active region is known to lack shapes.txt.
  useEffect(() => {
    if (regionHasShapes === false && templateKind === 'routes') {
      setTemplateKind('departures')
    }
  }, [regionHasShapes, templateKind])

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q || !stops.length) return []
    return stops
      .filter(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
      .slice(0, 8)
  }, [searchQuery, stops])

  const searchNoMatch = searchQuery.trim().length > 0 && searchResults.length === 0 && stops.length > 0

  useEffect(() => { setActiveIdx(0) }, [searchQuery])

  const handleSearchSelect = useCallback((stop: Stop) => {
    setStopId(stop.id)
    setStopName(stop.name)
    setSearchQuery('')
    setShowResults(false)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleRegionChange = useCallback((id: string) => {
    setRegionId(id)
    setStopId('')
    setStopName('')
    setPreviewUrl('')
    setSearchQuery('')
    setShowResults(false)
  }, [])

  const handleSelectStop = useCallback((stop: Stop) => {
    setStopId(stop.id)
    setStopName(stop.name)
  }, [])

  const buildParams = useCallback(() => ({
    region_id: regionId,
    stop_id: stopId,
    template: templateKind === 'routes' ? 'gtfs_routes_map' : 'rti_display',
    width, height, orientation, lang, limit,
  }), [regionId, stopId, templateKind, width, height, orientation, lang, limit])

  const handleLayoutChange = useCallback((layout: object) => setCustomLayout(layout), [])

  const handlePreview = useCallback(async () => {
    if (!regionId || !stopId) return
    setImgLoading(true)
    setRenderError('')
    try {
      const blob = templateSource === 'custom' && bgFile
        ? await renderCustom({ region_id: regionId, stop_id: stopId, limit, format: 'png' }, bgFile, customLayout)
        : await renderDefault({ ...buildParams(), format: 'png', _t: Date.now() })
      if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current)
      const url = URL.createObjectURL(blob)
      prevBlobUrl.current = url
      setPreviewUrl(url)
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'AbortError'
        ? 'Render timed out — server is taking too long, try again'
        : err instanceof Error ? err.message : 'Render failed'
      setRenderError(msg)
      setImgLoading(false)
    }
  }, [regionId, stopId, templateSource, bgFile, customLayout, limit, buildParams])

  const handleDownload = useCallback(async () => {
    if (!regionId || !stopId) return
    setRenderError('')
    setDownloading(true)
    try {
      const blob = templateSource === 'custom' && bgFile
        ? await renderCustom({ region_id: regionId, stop_id: stopId, limit, format }, bgFile, customLayout)
        : await renderDefault({ ...buildParams(), format })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `board.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'AbortError'
        ? 'Download timed out — server is taking too long, try again'
        : err instanceof Error ? err.message : `Couldn't generate the ${format.toUpperCase()} file`
      setRenderError(msg)
    } finally {
      setDownloading(false)
    }
  }, [regionId, stopId, templateSource, bgFile, customLayout, limit, format, buildParams])

  const selectedRegion = regions.find(r => String(r.id) === regionId)
  const regionStatus   = cacheStatus[regionId]
  // A custom board needs a background *and* at least one placed field, or it renders empty.
  const customFieldCount = (customLayout as { fields?: unknown[] }).fields?.length ?? 0
  const customMissingFields = templateSource === 'custom' && !!bgFile && customFieldCount === 0
  const canRender = Boolean(
    regionId && stopId &&
    (templateSource === 'default' || (bgFile && customFieldCount > 0)),
  )

  const readyCount   = Object.values(cacheStatus).filter(s => s === 'ready').length
  const warmingCount = Object.values(cacheStatus).filter(s => s === 'warming').length

  return (
    <Shell
      title="Dispatch"
      subtitle="Live"
      crumbs={['Workspace', 'Dashboard']}
    >
      {showHint && (
        <div className="mb-4 flex items-start gap-3 card-flat px-4 py-3 motion-safe:animate-fade-in">
          <span className="shrink-0 mt-0.5 h-7 w-7 rounded-lg bg-brand/10 text-brandText flex items-center justify-center" aria-hidden="true">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="3.5" />
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-sans text-[13px] text-fg leading-snug">
              Three steps to a board: <span className="font-medium">pick a region</span>
              <span className="text-fgSubtle"> → </span><span className="font-medium">choose a stop</span>
              <span className="text-fgSubtle"> → </span><span className="font-medium">preview &amp; download</span>.
            </p>
            <p className="mt-1 font-sans text-[12px] text-fgMuted leading-snug">
              The first time a region loads, its GTFS feed downloads in the background — that can take a few minutes for large feeds.
            </p>
          </div>
          <button
            type="button"
            onClick={dismissHint}
            aria-label="Dismiss tip"
            className="shrink-0 h-7 w-7 -mr-1 rounded-md text-fgSubtle hover:text-fg hover:bg-hover transition-colors flex items-center justify-center"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M3 3l6 6M9 3l-6 6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Ambient status strip — the task flow leads below, not the metrics */}
      <section aria-label="Workspace status" className="mb-5">
        <div className="card-flat flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5">
          <StatusItem label="Regions" value={regionsLoading ? '—' : String(regions.length)} note={`${readyCount} ready`} />
          <StripDivider />
          <StatusItem
            label="Warming"
            value={String(warmingCount)}
            note={warmingCount ? 'fetching feeds' : 'idle'}
            pulse={warmingCount > 0}
          />
          <StripDivider />
          <StatusItem
            label="Stops"
            value={stops.length ? stops.length.toLocaleString() : '—'}
            note={stopsPhase === 'loading' ? 'loading…' : stops.length ? 'loaded' : 'none yet'}
          />
          {selectedRegion && (
            <span className="ml-auto inline-flex items-center gap-1.5 font-sans text-[12px] text-fgMuted">
              <svg className="w-3.5 h-3.5 text-brand shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="10" r="3" />
                <path d="M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12z" />
              </svg>
              <span className="text-fg font-medium truncate max-w-[200px]">{selectedRegion.city}, {selectedRegion.country}</span>
            </span>
          )}
        </div>
      </section>

      {/* Two-column main layout */}
      <div className="grid grid-cols-12 gap-5">
        {/* LEFT — Configuration column */}
        <div className="col-span-12 xl:col-span-7 space-y-5">
          {/* Region + Stop card */}
          <Card padded={false}>
            <div className="p-5 border-b border-line">
              <CardHeader
                icon={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="12" cy="11" r="3" />
                    <path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z" />
                  </svg>
                }
                title="Region"
                description="Select an operator feed to load its stops."
                action={
                  regionId && regionStatus === 'ready'   ? <Badge variant="ready" pulse /> :
                  regionId && regionStatus === 'warming' ? <Badge variant="warming" pulse /> :
                  null
                }
              />
              <div className="mt-4">
                {regionsLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : regions.length === 0 ? (
                  <RegionEmpty isAdmin={isAdmin} onCommission={() => nav('/admin', { state: { tab: 'regions' } })} />
                ) : (
                  <Select
                    value={regionId}
                    onChange={e => handleRegionChange(e.target.value)}
                    aria-label="Select a region"
                  >
                    <option value="">Select a region…</option>
                    {regions.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name} — {r.city}, {r.country}
                      </option>
                    ))}
                  </Select>
                )}
                {selectedRegion && (
                  <div className="mt-3 flex items-center gap-2 text-[12px] text-fgMuted">
                    <svg className="w-3.5 h-3.5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M5 12l4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Active feed: <span className="text-fg font-medium">{selectedRegion.city}, {selectedRegion.country}</span></span>
                  </div>
                )}
              </div>
            </div>

            {/* Stop selection / map */}
            <div className="p-5">
              <CardHeader
                icon={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M2 12h4M18 12h4M12 2v4M12 18v4" strokeLinecap="round" />
                  </svg>
                }
                title="Stop"
                description={stopId ? stopName : 'Pin a location on the map or search by name or ID.'}
                action={stopId ? (
                  <span className="font-mono text-[10.5px] text-fgSubtle uppercase tracking-eyebrow">
                    ID · {stopId}
                  </span>
                ) : null}
              />

              {stopsPhase === 'loading' && (
                <div role="status" aria-live="polite"
                  className="mt-4 flex items-start gap-3 px-3.5 py-3 rounded-lg border border-warning/30 bg-warningSoft text-warningText">
                  <svg className="animate-spin w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <div className="min-w-0">
                    <p className="font-sans text-[12.5px] font-medium">
                      {selectedRegion ? `Warming ${selectedRegion.city}…` : 'Warming the feed…'}
                    </p>
                    <p className="mt-0.5 font-sans text-[11.5px]">
                      First load downloads the full GTFS schedule — a few minutes for large feeds. The stop map appears the moment it's ready.
                    </p>
                  </div>
                </div>
              )}

              {stopsPhase === 'error' && stopsMessage && (
                <div role="alert"
                  className="mt-4 flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-danger/30 bg-dangerSoft text-dangerText">
                  <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h0" strokeLinecap="round" />
                  </svg>
                  <div className="min-w-0">
                    <p className="font-sans text-[12.5px]">{stopsMessage}</p>
                    <p className="mt-0.5 font-sans text-[11.5px]">Re-select the region to try again.</p>
                  </div>
                </div>
              )}

              {/* Search */}
              {stopsPhase === 'ready' && (
                <div ref={searchRef} className="relative mt-4">
                  <Input
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setShowResults(true) }}
                    onFocus={() => setShowResults(true)}
                    onKeyDown={e => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault(); setShowResults(true)
                        setActiveIdx(i => Math.min(i + 1, searchResults.length - 1))
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0))
                      } else if (e.key === 'Enter') {
                        const pick = searchResults[Math.min(activeIdx, searchResults.length - 1)]
                        if (pick) { e.preventDefault(); handleSearchSelect(pick) }
                      } else if (e.key === 'Escape') {
                        setShowResults(false)
                      }
                    }}
                    placeholder="Search by name or ID…"
                    role="combobox"
                    aria-label="Search stop by name or ID"
                    aria-expanded={showResults}
                    aria-controls="stop-search-listbox"
                    aria-activedescendant={
                      showResults && searchResults[activeIdx] ? `stop-opt-${activeIdx}` : undefined
                    }
                    aria-haspopup="listbox"
                    leading={
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <circle cx="11" cy="11" r="7" />
                        <path d="M16.5 16.5L21 21" strokeLinecap="round" />
                      </svg>
                    }
                  />
                  {showResults && searchQuery.trim() && (
                    <div className="absolute z-dropdown left-0 right-0 mt-1.5 rounded-lg border border-line bg-surface shadow-pop overflow-hidden">
                      {searchResults.length > 0 ? (
                        <ul id="stop-search-listbox" role="listbox" aria-label="Matching stops" className="py-1">
                          {searchResults.map((stop, i) => (
                            <li
                              key={stop.id}
                              id={`stop-opt-${i}`}
                              role="option"
                              aria-selected={i === activeIdx}
                              onMouseEnter={() => setActiveIdx(i)}
                              onMouseDown={() => handleSearchSelect(stop)}
                              className={[
                                'px-3 py-2 flex items-center justify-between gap-3 cursor-pointer transition-colors',
                                i === activeIdx ? 'bg-hover' : '',
                              ].join(' ')}
                            >
                              <div className="min-w-0 flex items-center gap-2.5">
                                <svg className="w-3.5 h-3.5 text-fgSubtle shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                  <circle cx="12" cy="10" r="3" />
                                  <path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z" />
                                </svg>
                                <span className="font-sans text-[13px] text-fg truncate">{stop.name}</span>
                              </div>
                              <span className="font-mono text-[10.5px] text-fgSubtle ml-4 shrink-0">{stop.id}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="px-3 py-3 font-sans text-[12.5px] text-fgSubtle">No matching stops.</p>
                      )}
                    </div>
                  )}
                  {searchNoMatch && !showResults && (
                    <p className="mt-2 font-sans text-[11.5px] text-danger">
                      No match for "{searchQuery.trim()}".
                    </p>
                  )}
                </div>
              )}

              {/* Map */}
              <div className="mt-4 rounded-lg overflow-hidden border border-line">
                <StopMap
                  stops={stops}
                  selectedId={stopId}
                  onSelect={handleSelectStop}
                  city={selectedRegion?.city}
                  country={selectedRegion?.country}
                />
              </div>
            </div>
          </Card>

          {/* Template card */}
          <Card>
            <CardHeader
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 9v12" />
                </svg>
              }
              title="Template"
              description={
                templateKind === 'routes'
                  ? (templateSource === 'default'
                      ? 'Authority-issued routes map drawn from shapes.txt.'
                      : 'Bring your own background and JSON layout (with shapes_box).')
                  : (templateSource === 'default'
                      ? 'Authority-issued rti_display layout.'
                      : 'Bring your own background and JSON layout.')
              }
            />

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block font-sans text-[12px] font-medium text-fgMuted tracking-tightish">
                  Kind
                </label>
                <Segmented
                  value={templateKind}
                  onChange={setTemplateKind}
                  fullWidth
                  options={[
                    { value: 'departures', label: 'Departures' },
                    {
                      value: 'routes',
                      label: 'Routes',
                      disabled: regionHasShapes === false,
                    },
                  ]}
                  ariaLabel="Template kind"
                />
                {regionId && regionHasShapes === false && (
                  <p className="font-sans text-[11.5px] text-fgSubtle">
                    This region has no <span className="font-mono">shapes.txt</span> — routes map unavailable.
                  </p>
                )}
                {regionId && regionHasShapes === null && (
                  <p className="font-sans text-[11.5px] text-fgSubtle">
                    Checking <span className="font-mono">shapes.txt</span> availability…
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="block font-sans text-[12px] font-medium text-fgMuted tracking-tightish">
                  Source
                </label>
                <Segmented
                  value={templateSource}
                  onChange={setTemplateSource}
                  fullWidth
                  options={[
                    { value: 'default', label: 'Default' },
                    { value: 'custom',  label: 'Custom' },
                  ]}
                  ariaLabel="Template source"
                />
              </div>
            </div>

            {templateSource === 'custom' && (
              <div className="mt-5">
                <FileDrop
                  label="Background"
                  hint="PNG image"
                  file={bgFile}
                  dragOver={bgDragOver}
                  accept=".png,image/png"
                  onChange={setBgFile}
                  onDragOver={setBgDragOver}
                  icon={
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="9" r="1.5" />
                      <path d="M3 17l5-5 4 4 3-3 6 6" />
                    </svg>
                  }
                />
                {bgFile && (
                  <p className="mt-2 font-sans text-[12px] text-fgSubtle">
                    Position fields using the layout editor below.
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Display card */}
          <Card>
            <CardHeader
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="2" y="4" width="20" height="14" rx="2" />
                  <path d="M8 22h8M12 18v4" strokeLinecap="round" />
                </svg>
              }
              title="Display"
              description="Dimensions, language, and density of the rendered board."
            />

            <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-4">
              {templateSource === 'default' && (
                <Select label="Language" value={lang} onChange={e => setLang(e.target.value)} name="lang">
                  {LANGUAGES.map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                </Select>
              )}

              {templateSource === 'default' && (
                <Input label="Width (px)" type="number" value={width} min={100} max={4096}
                  onChange={e => setWidth(typedNum(e.target.value, width, 4096))}
                  onBlur={() => setWidth(w => Math.max(100, w))} name="width" />
              )}

              {templateSource === 'default' && (
                <Input label="Height (px)" type="number" value={height} min={100} max={4096}
                  onChange={e => setHeight(typedNum(e.target.value, height, 4096))}
                  onBlur={() => setHeight(h => Math.max(100, h))} name="height" />
              )}

              {templateSource === 'default' && (
                <div className="space-y-1.5 md:col-span-2">
                  <label className="block font-sans text-[12px] font-medium text-fgMuted tracking-tightish">
                    Orientation
                  </label>
                  <Segmented
                    value={orientation}
                    onChange={setOrientation}
                    fullWidth
                    options={[
                      { value: 'landscape', label: 'Landscape', icon: (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                          <rect x="1" y="1" width="14" height="10" rx="1" />
                        </svg>
                      )},
                      { value: 'portrait', label: 'Portrait', icon: (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 12 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                          <rect x="1" y="1" width="10" height="14" rx="1" />
                        </svg>
                      )},
                    ]}
                  />
                </div>
              )}

              <Input label="Max departures" type="number" value={limit} min={1} max={50}
                onChange={e => setLimit(typedNum(e.target.value, limit, 50))}
                onBlur={() => setLimit(l => Math.max(1, l))} name="limit" />
            </div>
          </Card>
        </div>

        {/* RIGHT — Action panel */}
        <div className="col-span-12 xl:col-span-5 space-y-5">
          <Card padded={false} className="sticky top-[88px]">
            <div className="p-5 border-b border-line">
              <div className="flex items-center justify-between">
                <div>
                  <div className="eyebrow">Render output</div>
                  <h2 className="mt-1 font-display text-[18px] font-semibold tracking-tight2">
                    {canRender ? 'Ready to render.' : 'Awaiting selection.'}
                  </h2>
                </div>
                <Badge
                  variant={canRender ? 'ready' : 'idle'}
                  label={canRender ? 'Ready' : 'Pending'}
                  pulse={canRender}
                />
              </div>

              {renderError && (
                <div role="alert" className="mt-4 flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-danger/30 bg-dangerSoft text-dangerText">
                  <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h0" strokeLinecap="round" />
                  </svg>
                  <p className="font-sans text-[12.5px] leading-snug">{renderError}</p>
                </div>
              )}

              <div className="mt-5 flex flex-col gap-2.5">
                <Button onClick={handlePreview} disabled={!canRender} loading={imgLoading} className="w-full" size="lg">
                  {imgLoading ? 'Rendering…' : 'Preview board'}
                  {!imgLoading && <span aria-hidden="true">→</span>}
                </Button>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Select
                    label=""
                    value={format}
                    onChange={e => setFormat(e.target.value)}
                    aria-label="Download format"
                    aria-describedby="format-hint"
                  >
                    {FORMATS.map(f => (
                      <option key={f} value={f} title={FORMAT_HINTS[f]}>{FORMAT_LABELS[f]}</option>
                    ))}
                  </Select>
                  <Button variant="secondary" onClick={handleDownload} disabled={!canRender || downloading} loading={downloading} size="lg">
                    {!downloading && (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
                      </svg>
                    )}
                    Download
                  </Button>
                </div>
                <p id="format-hint" className="font-sans text-[11.5px] text-fgSubtle leading-snug">
                  <span className="font-mono uppercase tracking-eyebrow text-fgMuted">{format}</span> — {FORMAT_HINTS[format]}
                </p>
                {customMissingFields && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-warning/30 bg-warningSoft text-warningText">
                    <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M12 9v4M12 17h0M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="font-sans text-[11.5px]">Enable at least one field in the layout editor below to render.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Spec list */}
            <dl className="px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px]">
              <SpecRow
                k="Template"
                v={`${TEMPLATE_LABELS[templateKind === 'routes' ? 'gtfs_routes_map' : 'rti_display']} · ${templateSource}`}
                title={templateKind === 'routes' ? 'gtfs_routes_map' : 'rti_display'}
              />
              <SpecRow k="Format" v={format.toUpperCase()} />
              <SpecRow k="Language" v={lang.toUpperCase()} />
              <SpecRow k="Dimensions" v={`${width} × ${height}`} mono />
              <SpecRow k="Orientation" v={orientation} />
              <SpecRow k="Max rows" v={String(limit)} mono />
            </dl>
          </Card>

          {/* Preview */}
          {previewUrl ? (
            <Card padded={false} className="overflow-hidden">
              <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-success animate-pulse-soft" aria-hidden="true" />
                  <span className="font-sans text-[13px] font-semibold tracking-tightish text-fg">Preview rendered</span>
                </div>
                <span className="font-mono text-[10.5px] uppercase tracking-eyebrow text-fgSubtle">
                  {width}×{height} · {lang.toUpperCase()}
                </span>
              </div>
              <div className="bg-elevated p-5 flex items-center justify-center min-h-[280px]">
                {imgLoading && <Skeleton className="w-full h-64" />}
                <img
                  key={previewUrl}
                  src={previewUrl}
                  alt="Generated departure board"
                  className={`max-w-full max-h-[520px] rounded-md shadow-card block transition-opacity duration-300 ${imgLoading ? 'hidden' : ''}`}
                  onLoad={() => setImgLoading(false)}
                  onError={() => setImgLoading(false)}
                />
              </div>
            </Card>
          ) : (
            <Card className="border-dashed flex flex-col items-center justify-center text-center py-12">
              <div className="h-12 w-12 rounded-xl border border-line bg-elevated flex items-center justify-center text-fgSubtle mb-3">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 16l5-5 4 4 3-3 6 6" />
                  <circle cx="9" cy="10" r="1.2" fill="currentColor" />
                </svg>
              </div>
              <h3 className="font-display text-[15px] font-semibold tracking-tight2 text-fg">
                No preview yet
              </h3>
              <p className="mt-1 font-sans text-[12.5px] text-fgMuted max-w-[280px]">
                Choose a region and stop, then hit <span className="text-fg font-medium">Preview board</span> to render.
              </p>
            </Card>
          )}
        </div>
      </div>

      {templateSource === 'custom' && bgFile && (
        <div className="mt-5">
          <CustomLayoutEditor
            bgFile={bgFile}
            limit={limit}
            onLayoutChange={handleLayoutChange}
          />
        </div>
      )}
    </Shell>
  )
}

function RegionEmpty({ isAdmin, onCommission }: { isAdmin: boolean; onCommission: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-elevated/40 px-4 py-5 text-center">
      <h3 className="font-display text-[14px] font-semibold tracking-tight2 text-fg">No regions yet</h3>
      <p className="mt-1 mx-auto max-w-[320px] font-sans text-[12.5px] text-fgMuted leading-snug">
        {isAdmin
          ? 'Commission a GTFS feed to start composing boards — its schedule downloads and caches automatically.'
          : 'No GTFS feeds are available yet. Ask a workspace admin to commission one.'}
      </p>
      {isAdmin && (
        <Button size="sm" className="mt-3" onClick={onCommission}>
          Commission a region
          <span aria-hidden="true">→</span>
        </Button>
      )}
    </div>
  )
}

function StripDivider() {
  return <span className="hidden sm:block w-px h-4 bg-line shrink-0" aria-hidden="true" />
}

function StatusItem({ label, value, note, pulse }: { label: string; value: string; note?: string; pulse?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="eyebrow">{label}</span>
      <span className="font-mono text-[13px] nums-tabular text-fg leading-none">{value}</span>
      {note && (
        <span className="inline-flex items-center gap-1.5 font-sans text-[11.5px] text-fgMuted">
          {pulse && (
            <span className="relative inline-flex items-center justify-center" aria-hidden="true">
              <span className="absolute h-2 w-2 rounded-full bg-warning opacity-50 animate-ping" />
              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
            </span>
          )}
          {note}
        </span>
      )}
    </div>
  )
}

function SpecRow({ k, v, mono, title }: { k: string; v: string; mono?: boolean; title?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/50 last:border-b-0 pb-1.5">
      <dt className="font-mono text-[10.5px] uppercase tracking-eyebrow text-fgSubtle">{k}</dt>
      <dd title={title} className={`text-fg ${mono ? 'font-mono nums-tabular' : 'font-sans'} text-[12.5px] truncate`}>{v}</dd>
    </div>
  )
}

interface FileDropProps {
  label: string
  hint: string
  file: File | null
  dragOver: boolean
  accept: string
  icon: React.ReactNode
  onChange: (f: File | null) => void
  onDragOver: (v: boolean) => void
}

function FileDrop({ label, hint, file, dragOver, accept, icon, onChange, onDragOver }: FileDropProps) {
  return (
    <label
      className={[
        'group relative flex flex-col gap-2 p-4 h-32 rounded-lg cursor-pointer',
        'border border-dashed transition-[border-color,background-color]',
        dragOver
          ? 'border-brand bg-brand/5'
          : file
            ? 'border-success/40 bg-successSoft/30 hover:bg-successSoft/50'
            : 'border-line bg-elevated/50 hover:bg-elevated',
      ].join(' ')}
      onDragOver={e => { e.preventDefault(); onDragOver(true) }}
      onDragLeave={() => onDragOver(false)}
      onDrop={e => { e.preventDefault(); onDragOver(false); const f = e.dataTransfer.files[0]; if (f) onChange(f) }}
    >
      <input type="file" accept={accept} className="sr-only" onChange={e => onChange(e.target.files?.[0] ?? null)} />
      <div className="flex items-center justify-between">
        <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${file ? 'bg-success/15 text-successText' : 'bg-surface text-fgMuted border border-line'}`}>
          {file ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12l4 4L19 6" />
            </svg>
          ) : icon}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-eyebrow text-fgSubtle">{hint}</span>
      </div>
      <div className="mt-auto">
        <div className="font-sans text-[13.5px] font-semibold text-fg tracking-tightish">{label}</div>
        <div className="font-sans text-[11.5px] text-fgMuted truncate">
          {file ? file.name : 'Drop or click to browse'}
        </div>
      </div>
    </label>
  )
}
