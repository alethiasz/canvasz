import { useEffect, useState } from 'react'
import { useSaveStatus } from './saveStatus'

const ROTULO = {
  ocioso: '',
  salvando: 'salvando…',
  salvo: 'salvo',
  erro: 'não salvou',
} as const

export function SaveIndicator() {
  const { estado, em } = useSaveStatus()
  const [, forcar] = useState(0)

  // "salvo" some depois de um tempo; erro fica até resolver.
  useEffect(() => {
    if (estado !== 'salvo') return
    const t = setTimeout(() => forcar((n) => n + 1), 2500)
    return () => clearTimeout(t)
  }, [estado, em])

  const recente = estado === 'salvo' && em !== null && Date.now() - em < 2500
  if (estado === 'ocioso' || (estado === 'salvo' && !recente)) return null

  return (
    <span className={`cz-save cz-save--${estado}`} role="status" aria-live="polite">
      {ROTULO[estado]}
    </span>
  )
}
