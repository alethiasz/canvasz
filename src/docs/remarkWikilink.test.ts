import { describe, expect, it } from 'vitest'
import { WIKILINK_PREFIX, remarkWikilink } from './remarkWikilink'

type Node = { type: string; value?: string; url?: string; children?: Node[] }

const paragrafo = (texto: string): Node => ({
  type: 'root',
  children: [{ type: 'paragraph', children: [{ type: 'text', value: texto }] }],
})

function transformar(arvore: Node): Node[] {
  remarkWikilink()(arvore as never)
  return arvore.children![0]!.children!
}

describe('remarkWikilink', () => {
  it('transforma [[Título]] em link com o protocolo interno', () => {
    const filhos = transformar(paragrafo('veja [[Referências]] depois'))
    expect(filhos.map((f) => f.type)).toEqual(['text', 'link', 'text'])
    expect(filhos[1]!.url).toBe(`${WIKILINK_PREFIX}${encodeURIComponent('Referências')}`)
    expect(filhos[1]!.children![0]!.value).toBe('Referências')
  })

  it('lida com vários links na mesma linha', () => {
    const filhos = transformar(paragrafo('[[Um]] e [[Dois]]'))
    expect(filhos.filter((f) => f.type === 'link')).toHaveLength(2)
  })

  it('tira os espaços das pontas do título', () => {
    const filhos = transformar(paragrafo('[[  Com espaços  ]]'))
    expect(filhos[0]!.children![0]!.value).toBe('Com espaços')
  })

  it('não mexe em texto sem wikilink', () => {
    const filhos = transformar(paragrafo('um [link](http://x) comum'))
    expect(filhos).toHaveLength(1)
    expect(filhos[0]!.type).toBe('text')
  })

  it('não toca em blocos de código', () => {
    // `code` e `inlineCode` guardam o conteúdo em `value`, não em nós de texto,
    // e é justamente por isso que este plugin é remark e não um regex no fonte.
    const arvore: Node = {
      type: 'root',
      children: [{ type: 'code', value: 'array[[0]][[1]]' }],
    }
    remarkWikilink()(arvore as never)
    expect(arvore.children![0]!.value).toBe('array[[0]][[1]]')
    expect(arvore.children![0]!.type).toBe('code')
  })

  it('ignora colchetes que não fecham', () => {
    const filhos = transformar(paragrafo('isto [[nao fecha e nada acontece'))
    expect(filhos).toHaveLength(1)
    expect(filhos[0]!.type).toBe('text')
  })
})
