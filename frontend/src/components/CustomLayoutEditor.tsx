import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardHeader } from './ui/Card'
import Input from './ui/Input'
import Segmented from './ui/Segmented'

type Align    = 'left' | 'center' | 'right'
type Weight   = 'regular' | 'bold'
type Category = 'static' | 'line' | 'dest' | 'time'
type AlignKind = 'left' | 'centerX' | 'right' | 'top' | 'middleY' | 'bottom'

interface FieldDef {
  id: string
  bind: string
  label: string
  category: Category
  enabled: boolean
  x: number       // image-space pixels
  y: number       // image-space pixels
  width: number   // text-box width in image pixels
  font_size: number
  font_weight: Weight
  color: string   // hex
  align: Align
}

interface Props {
  bgFile: File
  limit: number
  onLayoutChange: (layout: object) => void
}

interface Edges { l: boolean; r: boolean; t: boolean; b: boolean }

// Category colors come from theme tokens (see --c-cat-* in index.css). The L/D/T
// glyph carries the same meaning so category is never conveyed by color alone.
const CAT_BORDER: Record<Category, string> = {
  static: 'border-catStatic',
  line:   'border-catLine',
  dest:   'border-catDest',
  time:   'border-catTime',
}

const CAT_BADGE: Record<Category, string> = {
  static: 'bg-catStatic/15 text-catStatic',
  line:   'bg-catLine/15 text-catLine',
  dest:   'bg-catDest/15 text-catDest',
  time:   'bg-catTime/15 text-catTime',
}

// Enabled departure toggles: tinted fill + solid token text (AA in both themes).
const CAT_BTN: Record<Category, string> = {
  static: 'bg-catStatic/15 text-catStatic border-catStatic/40',
  line:   'bg-catLine/15 text-catLine border-catLine/40',
  dest:   'bg-catDest/15 text-catDest border-catDest/40',
  time:   'bg-catTime/15 text-catTime border-catTime/40',
}

// chip height = font_size * this factor (a single text line)
const LINE_H = 1.4

// Snap distance in image pixels (scaled by zoom at runtime)
const SNAP_PX = 6

// Resize handles, Figma-style. Sides change width, top/bottom + corners change font.
const HANDLES: { dir: string; edges: Edges; cursor: string; pos: React.CSSProperties }[] = [
  { dir: 'n',  edges: { l: false, r: false, t: true,  b: false }, cursor: 'ns-resize',   pos: { top: 0,      left: '50%', transform: 'translate(-50%,-50%)' } },
  { dir: 's',  edges: { l: false, r: false, t: false, b: true  }, cursor: 'ns-resize',   pos: { bottom: 0,   left: '50%', transform: 'translate(-50%,50%)'  } },
  { dir: 'e',  edges: { l: false, r: true,  t: false, b: false }, cursor: 'ew-resize',   pos: { right: 0,    top: '50%',  transform: 'translate(50%,-50%)'  } },
  { dir: 'w',  edges: { l: true,  r: false, t: false, b: false }, cursor: 'ew-resize',   pos: { left: 0,     top: '50%',  transform: 'translate(-50%,-50%)' } },
  { dir: 'ne', edges: { l: false, r: true,  t: true,  b: false }, cursor: 'nesw-resize', pos: { top: 0,      right: 0,    transform: 'translate(50%,-50%)'  } },
  { dir: 'nw', edges: { l: true,  r: false, t: true,  b: false }, cursor: 'nwse-resize', pos: { top: 0,      left: 0,     transform: 'translate(-50%,-50%)' } },
  { dir: 'se', edges: { l: false, r: true,  t: false, b: true  }, cursor: 'nwse-resize', pos: { bottom: 0,   right: 0,    transform: 'translate(50%,50%)'   } },
  { dir: 'sw', edges: { l: true,  r: false, t: false, b: true  }, cursor: 'nesw-resize', pos: { bottom: 0,   left: 0,     transform: 'translate(-50%,50%)'  } },
]

function makeFields(limit: number): FieldDef[] {
  const f: FieldDef[] = [
    { id: 'stop_name',    bind: 'stop_name',    label: 'Stop name', category: 'static', enabled: false, x: 20,  y: 20, width: 400, font_size: 28, font_weight: 'bold',    color: '#000000', align: 'left' },
    { id: 'current_time', bind: 'current_time', label: 'Clock',     category: 'static', enabled: false, x: 20,  y: 60, width: 120, font_size: 20, font_weight: 'regular', color: '#000000', align: 'left' },
    { id: 'current_date', bind: 'current_date', label: 'Date',      category: 'static', enabled: false, x: 160, y: 60, width: 160, font_size: 20, font_weight: 'regular', color: '#000000', align: 'left' },
  ]
  for (let i = 0; i < limit; i++) {
    const y = 120 + i * 50
    f.push({ id: `line.${i}`, bind: `line.${i}`, label: `Line ${i}`, category: 'line', enabled: false, x: 20,  y, width: 80,  font_size: 22, font_weight: 'bold',    color: '#000000', align: 'center' })
    f.push({ id: `dest.${i}`, bind: `dest.${i}`, label: `Dest ${i}`, category: 'dest', enabled: false, x: 120, y, width: 300, font_size: 22, font_weight: 'regular', color: '#000000', align: 'left'   })
    f.push({ id: `time.${i}`, bind: `time.${i}`, label: `Time ${i}`, category: 'time', enabled: false, x: 440, y, width: 100, font_size: 22, font_weight: 'regular', color: '#000000', align: 'right'  })
  }
  return f
}

const ZOOM_MIN  = 0.1
const ZOOM_MAX  = 4.0
const ZOOM_STEP = 0.25

export default function CustomLayoutEditor({ bgFile, limit, onLayoutChange }: Props) {
  const [fields,       setFields]       = useState<FieldDef[]>(() => makeFields(limit))
  const [selectedIds,  setSelectedIds]  = useState<string[]>([])
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [previewTexts, setPreviewTexts] = useState<Record<string, string>>({})
  const [zoom,         setZoom]         = useState(1)
  const [natW,         setNatW]         = useState(0)
  const [natH,         setNatH]         = useState(0)
  const [bgUrl,        setBgUrl]        = useState<string | null>(null)
  const [guides,       setGuides]       = useState<{ vx: number[]; hy: number[] }>({ vx: [], hy: [] })

  // Move: drag the chip body (moves all selected together)
  const dragRef   = useRef<{ ids: string[]; smx: number; smy: number; starts: Record<string, { x: number; y: number }> } | null>(null)
  // Resize: drag a handle on the selected chip
  const resizeRef = useRef<{ id: string; edges: Edges; smx: number; smy: number; startX: number; startY: number; startWidth: number; startFontSize: number } | null>(null)
  // Pan: drag the canvas background
  const panRef    = useRef<{ sx: number; sy: number; scrollX: number; scrollY: number } | null>(null)

  const imgRef             = useRef<HTMLImageElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const fieldsRef          = useRef(fields);      fieldsRef.current      = fields
  const zoomRef            = useRef(zoom);        zoomRef.current        = zoom
  const selectedIdsRef     = useRef(selectedIds); selectedIdsRef.current = selectedIds
  const natRef             = useRef({ w: natW, h: natH }); natRef.current = { w: natW, h: natH }

  // Undo/redo. Field arrays are always replaced immutably, so storing the current
  // reference is a valid snapshot. Snapshots are taken before each commit point.
  const historyRef = useRef<{ past: FieldDef[][]; future: FieldDef[][] }>({ past: [], future: [] })
  const snapshot = useCallback(() => {
    historyRef.current.past.push(fieldsRef.current)
    if (historyRef.current.past.length > 50) historyRef.current.past.shift()
    historyRef.current.future = []
  }, [])
  const undo = useCallback(() => {
    const h = historyRef.current
    if (!h.past.length) return
    h.future.push(fieldsRef.current)
    setFields(h.past.pop()!)
    setSelectedIds([])
    setEditingId(null)
  }, [])
  const redo = useCallback(() => {
    const h = historyRef.current
    if (!h.future.length) return
    h.past.push(fieldsRef.current)
    setFields(h.future.pop()!)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      if (e.shiftKey) redo(); else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  useEffect(() => {
    const url = URL.createObjectURL(bgFile)
    setBgUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [bgFile])

  useEffect(() => {
    setFields(prev => {
      const next    = makeFields(limit)
      const prevMap = new Map(prev.map(f => [f.id, f]))
      return next.map(f => prevMap.get(f.id) ?? f)
    })
  }, [limit])

  useEffect(() => {
    onLayoutChange({
      fields: fields
        .filter(f => f.enabled && f.width > 0)
        .map(({ bind, x, y, width, font_size, font_weight, color, align }) => ({
          bind, x, y, width, font_family: 'Inter', font_weight, font_size, align, color,
        })),
    })
  }, [fields, onLayoutChange])

  const fitToContainer = useCallback(() => {
    const img = imgRef.current
    const c   = canvasContainerRef.current
    if (!img?.naturalWidth || !c) return
    const fitZoom = (c.clientWidth - 32) / img.naturalWidth
    setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitZoom)))
  }, [])

  const handleImgLoad = useCallback(() => {
    const img = imgRef.current
    if (!img) return
    setNatW(img.naturalWidth)
    setNatH(img.naturalHeight)
    fitToContainer()
  }, [fitToContainer])

  const updateField = useCallback((id: string, patch: Partial<FieldDef>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f))
  }, [])

  const selectOne = useCallback((id: string, additive = false) => {
    setSelectedIds(prev => additive
      ? (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
      : [id])
  }, [])

  // Drag (move) — supports moving the whole selection
  const handleChipMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    snapshot()
    const cur = selectedIdsRef.current
    const ids = e.shiftKey
      ? (cur.includes(id) ? cur : [...cur, id])
      : (cur.includes(id) ? [...cur] : [id])
    setSelectedIds(ids)
    const starts: Record<string, { x: number; y: number }> = {}
    for (const f of fieldsRef.current) if (ids.includes(f.id)) starts[f.id] = { x: f.x, y: f.y }
    dragRef.current = { ids, smx: e.clientX, smy: e.clientY, starts }
  }, [snapshot])

  // Resize from a handle
  const handleResizeStart = useCallback((e: React.MouseEvent, id: string, edges: Edges) => {
    e.preventDefault()
    e.stopPropagation()
    snapshot()
    setSelectedIds([id])
    const field = fieldsRef.current.find(f => f.id === id)
    if (!field) return
    resizeRef.current = { id, edges, smx: e.clientX, smy: e.clientY, startX: field.x, startY: field.y, startWidth: field.width, startFontSize: field.font_size }
    const horiz = edges.l || edges.r, vert = edges.t || edges.b
    document.body.style.cursor = horiz && vert ? 'nwse-resize' : horiz ? 'ew-resize' : 'ns-resize'
  }, [snapshot])

  // Pan
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (editingId) return
    const c = canvasContainerRef.current
    panRef.current = { sx: e.clientX, sy: e.clientY, scrollX: c?.scrollLeft ?? 0, scrollY: c?.scrollTop ?? 0 }
    if (c) c.style.cursor = 'grabbing'
    setSelectedIds([])
    setEditingId(null)
  }, [editingId])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const z = zoomRef.current

    if (resizeRef.current) {
      const r  = resizeRef.current
      const dx = (e.clientX - r.smx) / z
      const dy = (e.clientY - r.smy) / z
      let x = r.startX, y = r.startY, width = r.startWidth, font_size = r.startFontSize

      if (r.edges.r)      width = Math.max(10, Math.round(r.startWidth + dx))
      else if (r.edges.l) { width = Math.max(10, Math.round(r.startWidth - dx)); x = r.startX + (r.startWidth - width) }

      if (r.edges.b)      font_size = Math.max(6, Math.round(r.startFontSize + dy / LINE_H))
      else if (r.edges.t) { font_size = Math.max(6, Math.round(r.startFontSize - dy / LINE_H)); y = r.startY + Math.round((r.startFontSize - font_size) * LINE_H) }

      x = Math.max(0, x); y = Math.max(0, y)
      setFields(prev => prev.map(f => f.id === r.id ? { ...f, x, y, width, font_size } : f))
      return
    }

    if (dragRef.current) {
      const d        = dragRef.current
      const all      = fieldsRef.current
      const moving   = new Set(d.ids)
      const { w, h } = natRef.current
      const primaryId = d.ids[d.ids.length - 1]
      const pf = all.find(f => f.id === primaryId)
      if (!pf) return
      const ps = d.starts[primaryId]
      let dxImg = (e.clientX - d.smx) / z
      let dyImg = (e.clientY - d.smy) / z
      const thresh = SNAP_PX / z

      // Snap the primary's edges/center to other fields and canvas edges/center
      const vLines: number[] = []
      const hLines: number[] = []
      for (const t of all) {
        if (!t.enabled || moving.has(t.id)) continue
        const th = t.font_size * LINE_H
        vLines.push(t.x, t.x + t.width / 2, t.x + t.width)
        hLines.push(t.y, t.y + th / 2, t.y + th)
      }
      if (w) vLines.push(0, w / 2, w)
      if (h) hLines.push(0, h / 2, h)

      const pw = pf.width, ph = pf.font_size * LINE_H
      const px = ps.x + dxImg, py = ps.y + dyImg
      const pXs = [px, px + pw / 2, px + pw]
      const pYs = [py, py + ph / 2, py + ph]
      const vG: number[] = [], hG: number[] = []

      let bestV: { adj: number; line: number } | null = null
      for (const a of pXs) for (const b of vLines) {
        const adj = b - a
        if (Math.abs(adj) <= thresh && (!bestV || Math.abs(adj) < Math.abs(bestV.adj))) bestV = { adj, line: b }
      }
      if (bestV) { dxImg += bestV.adj; vG.push(bestV.line) }

      let bestH: { adj: number; line: number } | null = null
      for (const a of pYs) for (const b of hLines) {
        const adj = b - a
        if (Math.abs(adj) <= thresh && (!bestH || Math.abs(adj) < Math.abs(bestH.adj))) bestH = { adj, line: b }
      }
      if (bestH) { dyImg += bestH.adj; hG.push(bestH.line) }

      setGuides({ vx: vG, hy: hG })
      setFields(prev => prev.map(f => moving.has(f.id)
        ? { ...f, x: Math.max(0, Math.round(d.starts[f.id].x + dxImg)), y: Math.max(0, Math.round(d.starts[f.id].y + dyImg)) }
        : f))
      return
    }

    if (panRef.current) {
      const c = canvasContainerRef.current
      if (c) {
        c.scrollLeft = panRef.current.scrollX + (panRef.current.sx - e.clientX)
        c.scrollTop  = panRef.current.scrollY + (panRef.current.sy - e.clientY)
      }
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    if (resizeRef.current) {
      resizeRef.current = null
      document.body.style.cursor = ''
    }
    if (dragRef.current) {
      dragRef.current = null
      setGuides({ vx: [], hy: [] })
    }
    if (panRef.current) {
      panRef.current = null
      const c = canvasContainerRef.current
      if (c) c.style.cursor = 'grab'
    }
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup',   handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup',   handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const applyAlign = (kind: AlignKind) => {
    const sel = fields.filter(f => selectedIds.includes(f.id))
    if (sel.length === 0) return
    snapshot()
    const single = sel.length === 1   // single field aligns to the canvas
    const h = (f: FieldDef) => f.font_size * LINE_H
    const L = single ? 0    : Math.min(...sel.map(f => f.x))
    const R = single ? natW : Math.max(...sel.map(f => f.x + f.width))
    const T = single ? 0    : Math.min(...sel.map(f => f.y))
    const B = single ? natH : Math.max(...sel.map(f => f.y + h(f)))
    const cx = (L + R) / 2, cy = (T + B) / 2
    setFields(prev => prev.map(f => {
      if (!selectedIds.includes(f.id)) return f
      switch (kind) {
        case 'left':    return { ...f, x: Math.max(0, Math.round(L)) }
        case 'centerX': return { ...f, x: Math.max(0, Math.round(cx - f.width / 2)) }
        case 'right':   return { ...f, x: Math.max(0, Math.round(R - f.width)) }
        case 'top':     return { ...f, y: Math.max(0, Math.round(T)) }
        case 'middleY': return { ...f, y: Math.max(0, Math.round(cy - h(f) / 2)) }
        case 'bottom':  return { ...f, y: Math.max(0, Math.round(B - h(f))) }
        default:        return f
      }
    }))
  }

  const distribute = (axis: 'h' | 'v') => {
    const sel = fields.filter(f => selectedIds.includes(f.id))
    if (sel.length < 3) return
    snapshot()
    const h = (f: FieldDef) => f.font_size * LINE_H
    const map = new Map<string, number>()
    if (axis === 'h') {
      const s    = [...sel].sort((a, b) => (a.x + a.width / 2) - (b.x + b.width / 2))
      const c0   = s[0].x + s[0].width / 2
      const c1   = s[s.length - 1].x + s[s.length - 1].width / 2
      const step = (c1 - c0) / (s.length - 1)
      s.forEach((f, i) => map.set(f.id, Math.max(0, Math.round(c0 + step * i - f.width / 2))))
      setFields(prev => prev.map(f => map.has(f.id) ? { ...f, x: map.get(f.id)! } : f))
    } else {
      const s    = [...sel].sort((a, b) => (a.y + h(a) / 2) - (b.y + h(b) / 2))
      const c0   = s[0].y + h(s[0]) / 2
      const c1   = s[s.length - 1].y + h(s[s.length - 1]) / 2
      const step = (c1 - c0) / (s.length - 1)
      s.forEach((f, i) => map.set(f.id, Math.max(0, Math.round(c0 + step * i - h(f) / 2))))
      setFields(prev => prev.map(f => map.has(f.id) ? { ...f, y: map.get(f.id)! } : f))
    }
  }

  const selectedField = selectedIds.length === 1 ? (fields.find(f => f.id === selectedIds[0]) ?? null) : null
  const enabledCount  = fields.filter(f => f.enabled).length
  const staticFields  = fields.filter(f => f.category === 'static')
  const depRows       = Array.from({ length: limit }, (_, i) => i)
  const imgW          = natW > 0 ? natW * zoom : undefined
  const canDistribute = selectedIds.length >= 3

  return (
    <Card padded={false}>
      <div className="p-5 border-b border-line">
        <CardHeader
          icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          title="Layout Editor"
          description={`${enabledCount} field${enabledCount !== 1 ? 's' : ''} placed — drag to move (snaps to edges) · drag handles to resize · shift-click to multi-select · double-click to type preview · ⌘Z to undo.`}
        />
      </div>

      <p className="lg:hidden px-5 py-2 border-b border-line bg-warningSoft/40 text-warningText font-sans text-[11.5px]">
        Best edited on a larger screen — dragging and panning need a mouse.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_272px] lg:divide-x divide-line" style={{ minHeight: 0 }}>

        {/* ── Canvas column ── */}
        <div className="flex flex-col min-h-0">

          {/* Zoom toolbar */}
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-line bg-surface shrink-0">
            <button
              onClick={undo}
              className="h-8 w-8 flex items-center justify-center rounded-md border border-line hover:bg-hover text-fgMuted hover:text-fg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              title="Undo (⌘Z)"
              aria-label="Undo"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-1" /></svg>
            </button>
            <button
              onClick={redo}
              className="h-8 w-8 flex items-center justify-center rounded-md border border-line hover:bg-hover text-fgMuted hover:text-fg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              title="Redo (⌘⇧Z)"
              aria-label="Redo"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h1" /></svg>
            </button>
            <span className="w-px h-5 bg-line mx-1" />
            <button
              onClick={() => setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
              className="h-8 w-8 flex items-center justify-center rounded-md border border-line hover:bg-hover text-fgMuted transition-colors text-lg leading-none"
              aria-label="Zoom out"
            >−</button>
            <button
              onClick={fitToContainer}
              disabled={!natW}
              className="font-mono text-[11px] text-fgMuted hover:text-fg transition-colors min-w-[44px] h-8 text-center disabled:opacity-40"
              title="Click to fit image to window"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => setZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
              className="h-8 w-8 flex items-center justify-center rounded-md border border-line hover:bg-hover text-fgMuted transition-colors text-lg leading-none"
              aria-label="Zoom in"
            >+</button>
            <span className="font-sans text-[11px] text-fgSubtle ml-1 select-none hidden md:inline">
              Click % to fit · drag background to pan
            </span>
          </div>

          {/* Alignment toolbar */}
          <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-line bg-surface shrink-0">
            <span className="font-mono text-[10px] text-fgSubtle mr-1.5 w-[78px] shrink-0">
              {selectedIds.length === 0 ? 'Align' : selectedIds.length === 1 ? 'To canvas' : `${selectedIds.length} selected`}
            </span>
            {([['left', 'Align left'], ['centerX', 'Align horizontal centers'], ['right', 'Align right']] as const).map(([k, t]) => (
              <AlignBtn key={k} kind={k} title={t} disabled={selectedIds.length === 0} onClick={() => applyAlign(k)} />
            ))}
            <span className="w-px h-4 bg-line mx-1" />
            {([['top', 'Align top'], ['middleY', 'Align vertical centers'], ['bottom', 'Align bottom']] as const).map(([k, t]) => (
              <AlignBtn key={k} kind={k} title={t} disabled={selectedIds.length === 0} onClick={() => applyAlign(k)} />
            ))}
            <span className="w-px h-4 bg-line mx-1" />
            <AlignBtn kind="dist-h" title="Distribute horizontally (3+)" disabled={!canDistribute} onClick={() => distribute('h')} />
            <AlignBtn kind="dist-v" title="Distribute vertically (3+)"   disabled={!canDistribute} onClick={() => distribute('v')} />
          </div>

          {/* Canvas */}
          <div
            ref={canvasContainerRef}
            className="flex-1 bg-elevated overflow-auto"
            style={{ padding: 16, cursor: 'grab' }}
            onMouseDown={handleCanvasMouseDown}
          >
            {bgUrl ? (
              <div className="relative select-none" style={{ display: 'inline-block', minWidth: 1 }}>
                <img
                  ref={imgRef}
                  src={bgUrl}
                  alt="Template background"
                  draggable={false}
                  onLoad={handleImgLoad}
                  style={{ display: 'block', ...(imgW ? { width: imgW } : { maxWidth: '100%' }) }}
                />

                {fields.filter(f => f.enabled).map(f => {
                  const isSelected = selectedIds.includes(f.id)
                  const isPrimary  = selectedIds.length === 1 && selectedIds[0] === f.id
                  const isEditing  = f.id === editingId
                  const chipW      = f.width * zoom
                  const chipH      = f.font_size * zoom * LINE_H
                  const preview    = previewTexts[f.id]

                  const textStyle: React.CSSProperties = {
                    display:      'block',
                    width:        '100%',
                    height:       '100%',
                    paddingLeft:  Math.max(1, zoom * 2),
                    paddingRight: Math.max(1, zoom * 2),
                    fontSize:     f.font_size * zoom,
                    fontWeight:   f.font_weight === 'bold' ? 700 : 400,
                    color:        f.color,
                    textAlign:    f.align,
                    fontFamily:   'Inter, sans-serif',
                    lineHeight:   `${chipH}px`,
                  }

                  return (
                    <div
                      key={f.id}
                      style={{
                        position:  'absolute',
                        left:      f.x * zoom,
                        top:       f.y * zoom,
                        width:     chipW,
                        height:    chipH,
                        boxSizing: 'border-box',
                      }}
                      className={[
                        'rounded-sm',
                        isEditing ? 'cursor-text' : 'cursor-move',
                        isSelected
                          ? `border-2 ${CAT_BORDER[f.category]}`
                          : 'border border-dashed border-white/50',
                      ].join(' ')}
                      onMouseDown={e => !isEditing && handleChipMouseDown(e, f.id)}
                      onDoubleClick={e => { e.stopPropagation(); setSelectedIds([f.id]); setEditingId(f.id) }}
                    >
                      <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
                        {isEditing ? (
                          <input
                            autoFocus
                            value={preview ?? f.label}
                            onChange={e => setPreviewTexts(prev => ({ ...prev, [f.id]: e.target.value }))}
                            onBlur={() => setEditingId(null)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setEditingId(null) }
                            }}
                            onClick={e => e.stopPropagation()}
                            onMouseDown={e => e.stopPropagation()}
                            style={{ ...textStyle, background: 'rgba(255,255,255,0.15)', border: 'none', outline: 'none' }}
                          />
                        ) : (
                          <span
                            style={{
                              ...textStyle,
                              whiteSpace:   'nowrap',
                              overflow:     'hidden',
                              textOverflow: 'ellipsis',
                              textShadow:   '0 0 4px rgba(255,255,255,0.65), 0 0 4px rgba(255,255,255,0.65)',
                            }}
                          >
                            {preview !== undefined ? preview : f.label}
                          </span>
                        )}
                      </div>

                      {isPrimary && !isEditing && HANDLES.map(h => (
                        <div
                          key={h.dir}
                          onMouseDown={e => handleResizeStart(e, f.id, h.edges)}
                          style={{
                            position:     'absolute',
                            width:        9,
                            height:       9,
                            background:   '#fff',
                            border:       '1.5px solid rgb(var(--c-brand))',
                            borderRadius: 2,
                            boxShadow:    '0 0 0 1px rgba(0,0,0,0.15)',
                            cursor:       h.cursor,
                            zIndex:       10,
                            ...h.pos,
                          }}
                        />
                      ))}
                    </div>
                  )
                })}

                {/* Snap guides */}
                {guides.vx.map((gx, i) => (
                  <div key={`gv${i}`} style={{ position: 'absolute', left: gx * zoom, top: 0, width: 1, height: natH * zoom, background: 'rgb(var(--c-snap))', pointerEvents: 'none', zIndex: 20 }} />
                ))}
                {guides.hy.map((gy, i) => (
                  <div key={`gh${i}`} style={{ position: 'absolute', top: gy * zoom, left: 0, height: 1, width: natW * zoom, background: 'rgb(var(--c-snap))', pointerEvents: 'none', zIndex: 20 }} />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 text-fgSubtle text-[13px]">Loading…</div>
            )}
          </div>
        </div>

        {/* ── Panel column ── */}
        <div className="flex flex-col min-h-0 border-t border-line lg:border-t-0">
          <div className="flex-1 overflow-y-auto">

            <div className="p-3 space-y-4">
              <section>
                <div className="font-mono text-[10px] uppercase tracking-eyebrow text-fgSubtle mb-1.5 px-1">Static</div>
                {staticFields.map(f => (
                  <FieldRow
                    key={f.id}
                    field={f}
                    isSelected={selectedIds.includes(f.id)}
                    onToggle={() => { snapshot(); updateField(f.id, { enabled: !f.enabled }); selectOne(f.id) }}
                    onSelect={() => { if (!f.enabled) { snapshot(); updateField(f.id, { enabled: true }) } selectOne(f.id) }}
                  />
                ))}
              </section>

              <section>
                <div className="font-mono text-[10px] uppercase tracking-eyebrow text-fgSubtle mb-1.5 px-1">Departures</div>
                <div className="space-y-1">
                  {depRows.map(i => {
                    const lineF = fields.find(f => f.id === `line.${i}`)!
                    const destF = fields.find(f => f.id === `dest.${i}`)!
                    const timeF = fields.find(f => f.id === `time.${i}`)!
                    return (
                      <div key={i} className="flex items-center gap-1 px-1">
                        <span className="font-mono text-[10px] text-fgSubtle w-4 shrink-0 text-right">{i}</span>
                        {([lineF, destF, timeF] as FieldDef[]).map(f => (
                          <button
                            key={f.id}
                            title={`${f.label} — click to ${f.enabled ? 'select' : 'enable'} (shift-click to multi-select), right-click to toggle`}
                            onClick={e => { if (!f.enabled) { snapshot(); updateField(f.id, { enabled: true }) } selectOne(f.id, e.shiftKey) }}
                            onContextMenu={e => { e.preventDefault(); snapshot(); updateField(f.id, { enabled: !f.enabled }); selectOne(f.id) }}
                            className={[
                              'flex-1 h-6 rounded text-[9.5px] font-medium truncate px-1 transition-colors border',
                              f.enabled
                                ? `${CAT_BTN[f.category]}${selectedIds.includes(f.id) ? ' ring-1 ring-brand' : ''}`
                                : 'bg-elevated border-line text-fgSubtle hover:text-fg',
                            ].join(' ')}
                          >
                            {f.category === 'line' ? 'L' : f.category === 'dest' ? 'D' : 'T'}
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
                <p className="mt-2 px-1 font-sans text-[10.5px] text-fgSubtle leading-relaxed">
                  L&nbsp;=&nbsp;line · D&nbsp;=&nbsp;destination · T&nbsp;=&nbsp;time<br />
                  Click to enable/select · right-click to toggle
                </p>
              </section>
            </div>

            {/* Property editor */}
            <div className="border-t border-line p-3 bg-elevated/30">
              {selectedField ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${CAT_BADGE[selectedField.category]}`}>
                      {selectedField.label}
                    </span>
                    <button
                      className="font-mono text-[10px] uppercase text-fgSubtle hover:text-danger transition-colors"
                      onClick={() => { snapshot(); updateField(selectedField.id, { enabled: false }); setSelectedIds([]) }}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Font size" type="number" min={6} max={300}
                      value={selectedField.font_size}
                      onChange={e => updateField(selectedField.id, { font_size: Math.max(6, +e.target.value) })} />
                    <Input label="Width px" type="number" min={10} max={4000}
                      value={selectedField.width}
                      onChange={e => updateField(selectedField.id, { width: Math.max(10, +e.target.value) })} />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Input label="X" type="number" min={0}
                      value={selectedField.x}
                      onChange={e => updateField(selectedField.id, { x: Math.max(0, +e.target.value) })} />
                    <Input label="Y" type="number" min={0}
                      value={selectedField.y}
                      onChange={e => updateField(selectedField.id, { y: Math.max(0, +e.target.value) })} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-sans text-[12px] font-medium text-fgMuted tracking-tightish">Weight</label>
                    <Segmented<Weight> size="sm" value={selectedField.font_weight} fullWidth
                      onChange={v => updateField(selectedField.id, { font_weight: v })}
                      options={[{ value: 'regular', label: 'Regular' }, { value: 'bold', label: 'Bold' }]}
                      ariaLabel="Font weight" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-sans text-[12px] font-medium text-fgMuted tracking-tightish">Align</label>
                    <Segmented<Align> size="sm" value={selectedField.align} fullWidth
                      onChange={v => updateField(selectedField.id, { align: v })}
                      options={[{ value: 'left', label: '←' }, { value: 'center', label: '↔' }, { value: 'right', label: '→' }]}
                      ariaLabel="Text align" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-sans text-[12px] font-medium text-fgMuted tracking-tightish">Color</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={selectedField.color}
                        onChange={e => updateField(selectedField.id, { color: e.target.value })}
                        className="h-8 w-8 rounded border border-line cursor-pointer" style={{ padding: '1px' }} />
                      <span className="font-mono text-[12px] text-fgMuted">{selectedField.color.toUpperCase()}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-sans text-[12px] font-medium text-fgMuted tracking-tightish">Preview text</label>
                    <Input
                      type="text"
                      placeholder={selectedField.label}
                      value={previewTexts[selectedField.id] ?? ''}
                      onChange={e => setPreviewTexts(prev => ({ ...prev, [selectedField.id]: e.target.value }))}
                    />
                    <p className="font-sans text-[10.5px] text-fgSubtle">Or double-click the chip on the canvas.</p>
                  </div>
                </div>
              ) : selectedIds.length > 1 ? (
                <p className="text-center font-sans text-[12px] text-fgSubtle py-3">
                  {selectedIds.length} fields selected — use the align &amp; distribute tools above.
                </p>
              ) : (
                <p className="text-center font-sans text-[12px] text-fgSubtle py-3">
                  Enable a field to edit its properties.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

function AlignBtn({ kind, title, disabled, onClick }: {
  kind: string
  title: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="h-7 w-7 flex items-center justify-center rounded-md text-fgMuted hover:bg-hover hover:text-fg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
    >
      <AlignIcon kind={kind} />
    </button>
  )
}

function AlignIcon({ kind }: { kind: string }) {
  const guide = (p: { x1: number; y1: number; x2: number; y2: number }) =>
    <line {...p} stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
  const bar = (p: { x: number; y: number; width: number; height: number }) =>
    <rect {...p} rx={0.6} fill="currentColor" />

  let body: React.ReactNode = null
  switch (kind) {
    case 'left':    body = <>{guide({ x1: 2, y1: 2, x2: 2, y2: 14 })}{bar({ x: 3.5, y: 4, width: 9, height: 2.6 })}{bar({ x: 3.5, y: 9.4, width: 5.5, height: 2.6 })}</>; break
    case 'centerX': body = <>{guide({ x1: 8, y1: 2, x2: 8, y2: 14 })}{bar({ x: 3.5, y: 4, width: 9, height: 2.6 })}{bar({ x: 5.25, y: 9.4, width: 5.5, height: 2.6 })}</>; break
    case 'right':   body = <>{guide({ x1: 14, y1: 2, x2: 14, y2: 14 })}{bar({ x: 3.5, y: 4, width: 9, height: 2.6 })}{bar({ x: 7, y: 9.4, width: 5.5, height: 2.6 })}</>; break
    case 'top':     body = <>{guide({ x1: 2, y1: 2, x2: 14, y2: 2 })}{bar({ x: 4, y: 3.5, width: 2.6, height: 9 })}{bar({ x: 9.4, y: 3.5, width: 2.6, height: 5.5 })}</>; break
    case 'middleY': body = <>{guide({ x1: 2, y1: 8, x2: 14, y2: 8 })}{bar({ x: 4, y: 3.5, width: 2.6, height: 9 })}{bar({ x: 9.4, y: 5.25, width: 2.6, height: 5.5 })}</>; break
    case 'bottom':  body = <>{guide({ x1: 2, y1: 14, x2: 14, y2: 14 })}{bar({ x: 4, y: 3.5, width: 2.6, height: 9 })}{bar({ x: 9.4, y: 7, width: 2.6, height: 5.5 })}</>; break
    case 'dist-h':  body = <>{bar({ x: 2, y: 3, width: 2.4, height: 10 })}{bar({ x: 6.8, y: 3, width: 2.4, height: 10 })}{bar({ x: 11.6, y: 3, width: 2.4, height: 10 })}</>; break
    case 'dist-v':  body = <>{bar({ x: 3, y: 2, width: 10, height: 2.4 })}{bar({ x: 3, y: 6.8, width: 10, height: 2.4 })}{bar({ x: 3, y: 11.6, width: 10, height: 2.4 })}</>; break
  }
  return <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" aria-hidden="true">{body}</svg>
}

function FieldRow({ field, isSelected, onToggle, onSelect }: {
  field: FieldDef
  isSelected: boolean
  onToggle: () => void
  onSelect: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => e.key === 'Enter' && onSelect()}
      className={[
        'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors',
        isSelected ? 'bg-hover' : 'hover:bg-hover/50',
      ].join(' ')}
    >
      <button
        className="shrink-0 h-6 w-6 -m-1 rounded-md flex items-center justify-center hover:bg-hover transition-colors"
        onClick={e => { e.stopPropagation(); onToggle() }}
        aria-label={`${field.enabled ? 'Disable' : 'Enable'} ${field.label}`}
        aria-pressed={field.enabled}
      >
        <span className={[
          'h-4 w-4 rounded border transition-colors flex items-center justify-center',
          field.enabled ? 'bg-brand border-brand' : 'border-lineStrong bg-transparent',
        ].join(' ')}>
          {field.enabled && (
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" className="w-2.5 h-2.5" aria-hidden="true">
              <path d="M5 12l4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </button>
      <span className={`flex-1 font-sans text-[12.5px] truncate ${field.enabled ? 'text-fg' : 'text-fgSubtle'}`}>
        {field.label}
      </span>
      {field.enabled && (
        <span className="font-mono text-[9.5px] text-fgSubtle shrink-0">{field.x},{field.y}</span>
      )}
    </div>
  )
}
