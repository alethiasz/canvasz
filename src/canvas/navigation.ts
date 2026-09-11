/**
 * Ponte entre os ShapeUtils e o roteador.
 *
 * O duplo clique num card é tratado pelo `ShapeUtil`, que é uma classe
 * instanciada pelo editor — não um componente React —, então não tem como
 * chamar `useNavigate`. As telas registram aqui como navegar, e os shapes só
 * pedem o destino.
 */
type Navigator = (to: string) => void

let navigator: Navigator | null = null

export function setNavigator(fn: Navigator): () => void {
  navigator = fn
  return () => {
    if (navigator === fn) navigator = null
  }
}

function go(to: string): void {
  if (!navigator) {
    console.warn('[canvasz] nenhuma tela registrada para navegar')
    return
  }
  navigator(to)
}

export const openCanvas = (canvasId: string) => go(`/canvas/${canvasId}`)
export const openDoc = (nodeId: string) => go(`/doc/${nodeId}`)
