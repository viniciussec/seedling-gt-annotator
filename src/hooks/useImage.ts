import { useEffect, useState } from 'react'

/** Carrega uma imagem a partir de uma URL e devolve o HTMLImageElement pronto (ou null). */
export function useImage(url: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!url) {
      setImg(null)
      return
    }
    let alive = true
    const im = new Image()
    im.onload = () => alive && setImg(im)
    im.src = url
    return () => {
      alive = false
    }
  }, [url])
  return img
}
