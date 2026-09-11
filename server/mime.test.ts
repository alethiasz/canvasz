import { describe, expect, it } from 'vitest'
import { FALLBACK_MIME, guessMime, previewKind } from './mime.ts'

describe('guessMime', () => {
  it('confia no tipo que o navegador informou', () => {
    expect(guessMime('foto.png', 'image/png')).toBe('image/png')
    expect(guessMime('sem-extensao', 'video/webm')).toBe('video/webm')
  })

  it('cai para a extensão quando o navegador não sabe', () => {
    expect(guessMime('doc.pdf', '')).toBe('application/pdf')
    expect(guessMime('script.py', FALLBACK_MIME)).toBe('text/x-python')
    expect(guessMime('FOTO.JPG')).toBe('image/jpeg')
  })

  it('nunca recusa: formato desconhecido vira octet-stream', () => {
    expect(guessMime('modelo.blend')).toBe(FALLBACK_MIME)
    expect(guessMime('arquivo-sem-ponto')).toBe(FALLBACK_MIME)
    expect(guessMime('')).toBe(FALLBACK_MIME)
  })
})

describe('previewKind', () => {
  it('classifica o que a interface consegue mostrar', () => {
    expect(previewKind('image/webp')).toBe('image')
    expect(previewKind('video/mp4')).toBe('video')
    expect(previewKind('audio/ogg')).toBe('audio')
    expect(previewKind('application/pdf')).toBe('pdf')
    expect(previewKind('text/x-rust')).toBe('text')
    expect(previewKind('application/json')).toBe('text')
    expect(previewKind('application/zip')).toBe('other')
  })
})
