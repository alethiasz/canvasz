import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROOT_CANVAS, searchAll, type SearchHit } from '../api'

const DEBOUNCE_MS = 150

const ICON: Record<SearchHit['kind'], string> = { folder: '📁', note: '📄', file: '📦' }

/** Destaca os termos que o FTS5 marcou com « » no trecho. */
function Excerpt({ text }: { text: string }) {
  const parts = useMemo(() => text.split(/«([^»]*)»/g), [text])
  if (!text.trim()) return null
  return (
    <span className="cz-palette__excerpt">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i}>{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  )
}

export function CommandPalette() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  // Cmd+K / Ctrl+K de qualquer lugar. Em captura porque o tldraw e o CodeMirror
  // também escutam o teclado e podem consumir o evento antes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // Foco síncrono, antes da pintura: com `requestAnimationFrame` a primeira
  // tecla digitada logo após o atalho se perdia.
  useLayoutEffect(() => {
    if (!open) return
    setActive(0)
    input.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!query.trim()) {
      setHits([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void searchAll(query)
        .then(({ hits: found }) => {
          if (cancelled) return
          setHits(found)
          setActive(0)
        })
        .catch((err) => console.error('[canvasz] falha na busca', err))
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, open])

  function openHit(hit: SearchHit, revealNoCanvas: boolean) {
    setOpen(false)
    setQuery('')
    if (hit.kind === 'folder' || revealNoCanvas) {
      const canvas = hit.kind === 'folder' ? hit.node_id : (hit.parent_id ?? ROOT_CANVAS)
      // `reveal` faz o canvas selecionar e enquadrar o card ao terminar de abrir.
      const reveal = hit.kind === 'folder' ? '' : `?reveal=${encodeURIComponent(hit.node_id)}`
      navigate(`/canvas/${canvas}${reveal}`)
      return
    }
    navigate(`/doc/${hit.node_id}`)
  }

  if (!open) return null

  return (
    <div className="cz-palette__backdrop" onMouseDown={() => setOpen(false)}>
      <div className="cz-palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          className="cz-palette__input"
          value={query}
          placeholder="Buscar em títulos, notas e dentro dos arquivos…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => Math.min(i + 1, hits.length - 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            }
            if (e.key === 'Enter' && hits[active]) openHit(hits[active], e.shiftKey)
          }}
        />

        {query.trim() && hits.length === 0 && (
          <p className="cz-palette__empty">nada encontrado</p>
        )}

        {hits.length > 0 && (
          <ul className="cz-palette__list">
            {hits.map((hit, i) => (
              <li key={hit.node_id}>
                <button
                  type="button"
                  className={`cz-palette__hit${i === active ? ' cz-palette__hit--active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={(e) => openHit(hit, e.shiftKey)}
                >
                  <span className="cz-palette__icon">{ICON[hit.kind]}</span>
                  <span className="cz-palette__text">
                    <span className="cz-palette__title">{hit.title.trim() || 'Sem título'}</span>
                    <Excerpt text={hit.excerpt} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <footer className="cz-palette__foot">
          <span>↑↓ navegar · ⏎ abrir · ⇧⏎ mostrar no canvas · esc fechar</span>
        </footer>
      </div>
    </div>
  )
}
