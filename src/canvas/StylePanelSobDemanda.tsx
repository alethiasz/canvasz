import { DefaultStylePanel, useEditor, useValue, type TLUiStylePanelProps } from 'tldraw'

/**
 * O painel de estilos só quando ele serve para alguma coisa.
 *
 * Por padrão o tldraw o mantém aberto o tempo todo, ocupando um bloco fixo do
 * canto superior direito — e ele acabava cobrindo os cards que estivessem ali.
 * Cores e espessura só importam com algo selecionado ou com uma ferramenta de
 * desenho na mão; fora disso, o espaço é do seu conteúdo.
 */
export function StylePanelSobDemanda(props: TLUiStylePanelProps) {
  const editor = useEditor()
  const util = useValue(
    'painel de estilos é útil agora',
    () => editor.getSelectedShapeIds().length > 0 || editor.getCurrentToolId() !== 'select',
    [editor],
  )

  if (!util) return null
  return <DefaultStylePanel {...props} />
}
