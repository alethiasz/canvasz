import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createNode, resolveTitle, type NodeKind } from '../api'
import { FILE_PREFIX, fileDownloadUrl, fileRawUrl } from '../files'
import { WIKILINK_PREFIX, remarkWikilink } from './remarkWikilink'

type Target = { id: string; kind: NodeKind } | null

/**
 * Um `[[Título]]`. Resolve o destino ao renderizar; se não existir nota com
 * esse nome, o link aparece diferente e o clique cria a nota — que é o jeito
 * de ir escrevendo antes de organizar.
 */
function WikiLink({ title, parentId }: { title: string; parentId: string | null }) {
  const navigate = useNavigate()
  const [target, setTarget] = useState<Target>(null)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    let cancelled = false
    setResolved(false)
    void resolveTitle(title)
      .then(({ node }) => {
        if (cancelled) return
        setTarget(node)
        setResolved(true)
      })
      .catch(() => !cancelled && setResolved(true))
    return () => {
      cancelled = true
    }
  }, [title])

  async function handleClick() {
    if (target) {
      navigate(target.kind === 'folder' ? `/canvas/${target.id}` : `/doc/${target.id}`)
      return
    }
    try {
      const { node } = await createNode(parentId ?? '__root__', 'note', title)
      navigate(`/doc/${node.id}`)
    } catch (err) {
      console.error('[canvasz] falha ao criar nota do wikilink', err)
    }
  }

  const missing = resolved && !target
  return (
    <button
      type="button"
      className={`cz-wikilink${missing ? ' cz-wikilink--missing' : ''}`}
      title={missing ? `Criar nota "${title}"` : `Abrir "${title}"`}
      onClick={handleClick}
    >
      {title}
    </button>
  )
}

export function MarkdownPreview({
  markdown,
  parentId,
}: {
  markdown: string
  parentId: string | null
}) {
  if (!markdown.trim()) {
    return <div className="cz-preview cz-preview--empty">nada escrito ainda</div>
  }

  return (
    <div className="cz-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkWikilink]}
        // O react-markdown sanitiza protocolos desconhecidos, e `canvasz://` é
        // um deles: sem esta exceção o href do wikilink e dos anexos chegaria
        // vazio. O resto das URLs continua passando pelo sanitizador padrão.
        urlTransform={(url) =>
          url.startsWith(WIKILINK_PREFIX) || url.startsWith(FILE_PREFIX)
            ? url
            : defaultUrlTransform(url)
        }
        components={{
          a({ href, children }) {
            if (href?.startsWith(WIKILINK_PREFIX)) {
              const title = decodeURIComponent(href.slice(WIKILINK_PREFIX.length))
              return <WikiLink title={title} parentId={parentId} />
            }
            if (href?.startsWith(FILE_PREFIX)) {
              const id = href.slice(FILE_PREFIX.length)
              return (
                <a className="cz-filechip" href={fileDownloadUrl(id)} download>
                  📎 {children}
                </a>
              )
            }
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            )
          },
          img({ src, alt }) {
            const url = typeof src === 'string' && src.startsWith(FILE_PREFIX)
              ? fileRawUrl(src.slice(FILE_PREFIX.length))
              : src
            return <img src={url} alt={alt ?? ''} />
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
