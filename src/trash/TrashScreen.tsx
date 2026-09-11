import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROOT_CANVAS, emptyTrash, listTrash, purgeNode, updateNode, type TrashItem } from '../api'

const ICON: Record<TrashItem['kind'], string> = { folder: '📁', note: '📄', file: '📦' }

function quando(ms: number): string {
  const minutos = Math.round((Date.now() - ms) / 60000)
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `há ${horas} h`
  return new Date(ms).toLocaleDateString('pt-BR')
}

export function TrashScreen() {
  const navigate = useNavigate()
  const [items, setItems] = useState<TrashItem[] | null>(null)

  const load = useCallback(() => {
    void listTrash()
      .then(({ items: found }) => setItems(found))
      .catch((err) => {
        console.error('[canvasz] falha ao carregar a lixeira', err)
        setItems([])
      })
  }, [])

  useEffect(load, [load])

  async function restaurar(item: TrashItem) {
    try {
      await updateNode(item.id, { restore: true })
      load()
    } catch (err) {
      console.error('[canvasz] falha ao restaurar', err)
    }
  }

  async function apagarDeVez(item: TrashItem) {
    const extra = item.descendants > 0 ? ` e mais ${item.descendants} item(ns) dentro` : ''
    // Isto não tem desfazer: os arquivos saem do disco.
    if (!window.confirm(`Apagar "${item.title}"${extra} de vez? Não dá para desfazer.`)) return
    try {
      await purgeNode(item.id)
      load()
    } catch (err) {
      console.error('[canvasz] falha ao apagar de vez', err)
    }
  }

  async function esvaziar() {
    if (!window.confirm('Esvaziar a lixeira? Tudo que está aqui some de vez.')) return
    try {
      await emptyTrash()
      load()
    } catch (err) {
      console.error('[canvasz] falha ao esvaziar', err)
    }
  }

  return (
    <div className="cz-app">
      <header className="cz-topbar">
        <span className="cz-brand">canvasz</span>
        <button type="button" className="cz-button" onClick={() => navigate(`/canvas/${ROOT_CANVAS}`)}>
          ← voltar ao canvas
        </button>
        <span className="cz-crumb" style={{ cursor: 'default' }}>
          🗑 lixeira
        </span>
        <div className="cz-actions">
          <button
            type="button"
            className="cz-button"
            onClick={esvaziar}
            disabled={!items || items.length === 0}
          >
            esvaziar lixeira
          </button>
        </div>
      </header>

      <div className="cz-trash">
        {items === null && <p className="cz-trash__empty">carregando…</p>}
        {items?.length === 0 && (
          <p className="cz-trash__empty">
            a lixeira está vazia. O que você apaga no canvas para aqui, e volta com Ctrl+Z ou
            pelo botão restaurar.
          </p>
        )}
        {items && items.length > 0 && (
          <ul className="cz-trash__list">
            {items.map((item) => (
              <li key={item.id} className="cz-trash__item">
                <span className="cz-trash__icon">{ICON[item.kind]}</span>
                <span className="cz-trash__text">
                  <span className="cz-trash__title">{item.title.trim() || 'Sem título'}</span>
                  <span className="cz-trash__meta">
                    apagado {quando(item.deleted_at)}
                    {item.descendants > 0 && ` · leva ${item.descendants} item(ns) junto`}
                  </span>
                </span>
                <button type="button" className="cz-button" onClick={() => restaurar(item)}>
                  restaurar
                </button>
                <button
                  type="button"
                  className="cz-button cz-button--danger"
                  onClick={() => apagarDeVez(item)}
                >
                  apagar de vez
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
