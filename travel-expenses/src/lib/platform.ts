import { Capacitor } from '@capacitor/core'
import { toast } from '../components/ui'

/** Integración con Android (Capacitor) con alternativa web. */
export const isNative = Capacitor.isNativePlatform()

export async function shareText(opts: { title?: string; text: string; url?: string }): Promise<void> {
  try {
    if (isNative) {
      const { Share } = await import('@capacitor/share')
      await Share.share({ title: opts.title, text: opts.text, url: opts.url, dialogTitle: opts.title })
      return
    }
    if (navigator.share) {
      await navigator.share(opts)
      return
    }
  } catch {
    return // el usuario canceló
  }
  await copyText(opts.url ? `${opts.text}\n${opts.url}` : opts.text)
}

export async function copyText(text: string, msg = 'Copiado'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast(msg)
  } catch {
    toast('No se pudo copiar')
  }
}

/** Guarda/comparte un archivo: en Android abre el menú de compartir (Drive, WhatsApp, email…); en web lo descarga. */
export async function saveFile(filename: string, content: string, mime: string): Promise<void> {
  if (isNative) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
      const { Share } = await import('@capacitor/share')
      const res = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 })
      await Share.share({ title: filename, files: [res.uri], dialogTitle: 'Guardar o enviar' })
    } catch {
      /* cancelado */
    }
    return
  }
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
