import { useEditor, useValue } from 'tldraw'

/**
 * O que um canvas vazio diz.
 *
 * Antes ele não dizia nada: tela em branco, e as ações moravam numa barra
 * cinza no topo que não chamava atenção nenhuma. Quem abria o app pela
 * primeira vez não tinha pista do que fazer.
 */
export function EmptyHint({ aoCriar }: { aoCriar: (kind: 'folder' | 'note') => void }) {
  const editor = useEditor()
  const vazio = useValue('canvas vazio', () => editor.getCurrentPageShapes().length === 0, [editor])

  if (!vazio) return null

  return (
    <div className="cz-empty">
      <div className="cz-empty__caixa">
        <h2 className="cz-empty__titulo">Este canvas está vazio</h2>
        <p className="cz-empty__texto">
          Crie uma pasta para um projeto, uma nota para escrever, ou solte
          arquivos aqui — de qualquer formato.
        </p>
        <div className="cz-empty__acoes">
          <button type="button" className="cz-button cz-button--primary" onClick={() => aoCriar('folder')}>
            Criar uma pasta
          </button>
          <button type="button" className="cz-button cz-button--primary" onClick={() => aoCriar('note')}>
            Criar uma nota
          </button>
        </div>
        <p className="cz-empty__dica">
          Você também pode desenhar à mão com as ferramentas embaixo, e buscar
          em tudo com <kbd>Ctrl</kbd>+<kbd>K</kbd>.
        </p>
      </div>
    </div>
  )
}
