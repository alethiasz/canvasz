import { create } from 'zustand'

export type EstadoSalvamento = 'ocioso' | 'salvando' | 'salvo' | 'erro'

type SaveState = {
  estado: EstadoSalvamento
  /** Quando o último salvamento deu certo, para o "salvo há pouco". */
  em: number | null
}

/**
 * Um app que salva sozinho precisa dizer que salvou. Sem isso resta a dúvida
 * de sempre — "será que gravou?" — e a única resposta é fechar e torcer.
 */
export const useSaveStatus = create<SaveState>(() => ({ estado: 'ocioso', em: null }))

export const marcarSalvando = () => useSaveStatus.setState({ estado: 'salvando' })
export const marcarSalvo = () => useSaveStatus.setState({ estado: 'salvo', em: Date.now() })
export const marcarErro = () => useSaveStatus.setState({ estado: 'erro' })
