import { visit } from 'unist-util-visit'

export const WIKILINK_PREFIX = 'canvasz://note/'

const WIKILINK = /\[\[([^\][\n]+)\]\]/g

type TextNode = { type: 'text'; value: string }
type LinkNode = { type: 'link'; url: string; children: TextNode[] }
type AnyNode = { type: string; value?: string; children?: AnyNode[] }

/**
 * Transforma `[[Título]]` em link com a URL `canvasz://note/<título>`.
 *
 * É um plugin remark, e não uma troca no texto puro, justamente para não mexer
 * dentro de blocos de código: o `visit` só passa por nós de texto, e o conteúdo
 * de `code`/`inlineCode` não é um nó de texto.
 */
export function remarkWikilink() {
  return (tree: AnyNode) => {
    visit(tree, 'text', (node: AnyNode, index, parent: AnyNode | undefined) => {
      if (!parent || index === undefined || parent.type === 'link') return
      const value = node.value ?? ''

      WIKILINK.lastIndex = 0
      if (!WIKILINK.test(value)) return
      WIKILINK.lastIndex = 0

      const out: (TextNode | LinkNode)[] = []
      let last = 0
      let match: RegExpExecArray | null

      while ((match = WIKILINK.exec(value)) !== null) {
        if (match.index > last) out.push({ type: 'text', value: value.slice(last, match.index) })
        const title = match[1]!.trim()
        out.push({
          type: 'link',
          url: `${WIKILINK_PREFIX}${encodeURIComponent(title)}`,
          children: [{ type: 'text', value: title }],
        })
        last = match.index + match[0].length
      }
      if (last < value.length) out.push({ type: 'text', value: value.slice(last) })

      parent.children!.splice(index, 1, ...(out as AnyNode[]))
      // Continua depois do que acabamos de inserir, senão o visit reprocessa.
      return index + out.length
    })
  }
}
