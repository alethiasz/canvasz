import { useEffect, useState } from 'react'
import {
  KIND_ICON,
  fileDownloadUrl,
  fileRawUrl,
  formatSize,
  previewKind,
  type FileMeta,
} from '../files'

/** Texto e código são buscados e mostrados crus; nada de destaque de sintaxe. */
function TextPreview({ id }: { id: string }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setText(null)
    setError(null)
    void fetch(fileRawUrl(id))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => !cancelled && setText(t))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [id])

  if (error) return <p className="cz-filepreview__msg">não deu para ler: {error}</p>
  if (text === null) return <p className="cz-filepreview__msg">carregando…</p>
  return <pre className="cz-filepreview__text">{text}</pre>
}

export function FilePreview({ file }: { file: FileMeta }) {
  const id = file.node_id
  const kind = previewKind(file.mime)
  const src = fileRawUrl(id)

  return (
    <div className="cz-filepreview">
      <div className="cz-filepreview__bar">
        <span>
          {KIND_ICON[kind]} {file.mime} · {formatSize(file.size)}
        </span>
        {/* Formato nenhum fica sem saída: sempre dá para baixar. */}
        <a className="cz-button" href={fileDownloadUrl(id)} download={file.original_name}>
          ↓ baixar
        </a>
      </div>

      <div className="cz-filepreview__body">
        {kind === 'image' && <img className="cz-filepreview__img" src={src} alt={file.original_name} />}
        {kind === 'video' && <video className="cz-filepreview__media" src={src} controls />}
        {kind === 'audio' && <audio className="cz-filepreview__media" src={src} controls />}
        {kind === 'pdf' && <iframe className="cz-filepreview__frame" src={src} title={file.original_name} />}
        {kind === 'text' && <TextPreview id={id} />}
        {kind === 'other' && (
          <div className="cz-filepreview__generic">
            <span className="cz-filepreview__bigicon">{KIND_ICON.other}</span>
            <p>
              Sem visualização para <code>{file.mime}</code>.
            </p>
            <p className="cz-filepreview__msg">O arquivo está guardado e pode ser baixado.</p>
          </div>
        )}
      </div>
    </div>
  )
}
