import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { ROOT_CANVAS } from './api'
import { CanvasScreen } from './canvas/CanvasScreen'
import { DocsScreen } from './docs/DocsScreen'
import { CommandPalette } from './search/CommandPalette'
import { TrashScreen } from './trash/TrashScreen'
import { Toasts } from './ui/toasts'

function CanvasRoute() {
  const { canvasId } = useParams<{ canvasId: string }>()
  const id = canvasId ?? ROOT_CANVAS
  // A key remonta a tela inteira ao trocar de pasta, zerando editor e trilha.
  return <CanvasScreen key={id} canvasId={id} />
}

function DocsRoute() {
  const { nodeId } = useParams<{ nodeId: string }>()
  return <DocsScreen nodeId={nodeId} />
}

export function App() {
  return (
    <>
      <CommandPalette />
      <Toasts />
      <Routes>
        <Route path="/" element={<Navigate to={`/canvas/${ROOT_CANVAS}`} replace />} />
        <Route path="/canvas/:canvasId" element={<CanvasRoute />} />
        <Route path="/doc" element={<DocsRoute />} />
        <Route path="/doc/:nodeId" element={<DocsRoute />} />
        <Route path="/lixeira" element={<TrashScreen />} />
        <Route path="*" element={<Navigate to={`/canvas/${ROOT_CANVAS}`} replace />} />
      </Routes>
    </>
  )
}
