import { ClipboardPaste, Lock } from 'lucide-react'
import { useState } from 'react'
import { Button, Sheet, toast } from '../components/ui'
import { useStore } from '../lib/store'
import { decodeInvite, pull } from '../lib/sync/client'
import { getIdentity } from '../lib/sync/identity'
import { mergeTrips } from '../lib/share'

/** Unirse a un grupo cifrado a partir de una invitación (código o enlace). */
export function useJoin(onJoined: (tripId: string) => void) {
  const { dispatch, getTrip } = useStore()
  return async (text: string): Promise<boolean> => {
    const inv = decodeInvite(text)
    if (!inv) {
      toast('La invitación no es válida')
      return false
    }
    try {
      const id = await getIdentity()
      const r = await pull({ ...inv, cursor: 0 }, id)
      if (r.trips.length === 0) {
        toast(r.rejected ? 'Los datos del grupo no superaron la verificación' : 'El grupo aún no tiene datos: pide a quien te invitó que abra la app')
        return false
      }
      const merged = r.trips.slice(1).reduce((acc, t) => mergeTrips(acc, t), r.trips[0])
      const existing = getTrip(merged.id)
      if (existing?.sync && existing.sync.groupId !== inv.groupId && !existing.sync.revoked) {
        if (!confirm('Ya sincronizas este viaje con otro grupo. ¿Cambiar al grupo de esta invitación?')) return false
      }
      dispatch({ type: 'importTrip', trip: merged })
      dispatch({ type: 'setSync', tripId: merged.id, sync: { relay: inv.relay, groupId: inv.groupId, secret: inv.secret, cursor: r.cursor, lastSyncAt: Date.now() } })
      toast(`Te has unido a «${merged.name}»`)
      onJoined(merged.id)
      return true
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo unir al grupo')
      return false
    }
  }
}

export function JoinSheet({ onClose, onJoined }: { onClose: () => void; onJoined: (tripId: string) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const join = useJoin(onJoined)

  return (
    <Sheet open onClose={onClose} title="Unirse a un grupo">
      <p className="mb-3 flex gap-2 text-sm text-slate-600 dark:text-slate-300">
        <Lock size={16} className="mt-0.5 shrink-0 text-brand-600" />
        Pega el enlace o el código de invitación que te enviaron. También puedes escanear el QR con la cámara del móvil.
      </p>
      <textarea className="input min-h-28 font-mono text-xs" placeholder="MOCHILA1.…" value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="off" spellCheck={false} />
      <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
        <Button
          variant="secondary"
          aria-label="Pegar"
          onClick={async () => {
            try {
              setText(await navigator.clipboard.readText())
            } catch {
              toast('No se pudo leer el portapapeles')
            }
          }}
        >
          <ClipboardPaste size={16} />
        </Button>
        <Button
          disabled={busy || !text.trim()}
          onClick={async () => {
            setBusy(true)
            if (await join(text)) onClose()
            setBusy(false)
          }}
        >
          {busy ? 'Descifrando…' : 'Unirme'}
        </Button>
      </div>
    </Sheet>
  )
}
