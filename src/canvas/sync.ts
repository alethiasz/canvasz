/**
 * Alterações que nós mesmos fazemos no canvas (reconciliação, criação de um
 * card logo após criar o nó) não devem disparar de volta as chamadas de API
 * que sincronizam shapes com nós — só as ações do usuário devem.
 */
let depth = 0

export function withoutSync<T>(fn: () => T): T {
  depth++
  try {
    return fn()
  } finally {
    depth--
  }
}

export const isSyncSuppressed = (): boolean => depth > 0
