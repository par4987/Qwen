import { Download, FileJson, Link2, Share2, Trash2 } from 'lucide-react'
import { Avatar, Button, cx, toast } from '../components/ui'
import { download, tripToCsv } from '../lib/csv'
import { useStore } from '../lib/store'
import { shareUrl } from '../lib/share'
import type { Trip } from '../lib/types'
import { TripForm } from './TripForm'

function slug(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'viaje'
}

export function SettingsTab({ trip, onDeleted }: { trip: Trip; onDeleted: () => void }) {
  const { dispatch, me } = useStore()
  const myId = me[trip.id]

  const shareLink = async () => {
    const url = shareUrl(trip)
    try {
      if (navigator.share) await navigator.share({ title: `${trip.emoji} ${trip.name}`, text: `Únete a las cuentas de «${trip.name}» en Mochila`, url })
      else {
        await navigator.clipboard.writeText(url)
        toast('Enlace copiado')
      }
    } catch {
      /* cancelado */
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(trip))
      toast('Enlace copiado')
    } catch {
      toast('No se pudo copiar')
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-4">
        <h3 className="text-sm font-bold">Compartir con el grupo</h3>
        <p className="mt-1 text-xs text-slate-500">
          Sin cuentas ni registro: envía el enlace por WhatsApp, Telegram o email. Quien lo abra tendrá una copia del viaje, y cuando
          te reenvíen su enlace actualizado, Mochila fusiona los cambios de ambos automáticamente.
        </p>
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={shareLink}>
            <Share2 size={16} /> Compartir enlace
          </Button>
          <Button variant="secondary" onClick={copyLink} aria-label="Copiar enlace">
            <Link2 size={16} />
          </Button>
        </div>
      </section>

      <section className="card p-4">
        <h3 className="text-sm font-bold">¿Quién eres en este viaje?</h3>
        <p className="mt-1 text-xs text-slate-500">Sólo se guarda en este dispositivo. Sirve para mostrarte lo que debes o te deben.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {trip.participants.map((p) => (
            <button
              key={p.id}
              onClick={() => dispatch({ type: 'setMe', tripId: trip.id, participantId: p.id })}
              className={cx(
                'flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm font-medium',
                myId === p.id ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-700/30 dark:text-brand-100' : 'border-slate-200 dark:border-slate-700',
              )}
            >
              <Avatar p={p} size={24} /> {p.name}
            </button>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h3 className="mb-4 text-sm font-bold">Datos del viaje</h3>
        <TripForm
          key={trip.updatedAt}
          initial={trip}
          submitLabel="Guardar cambios"
          onSubmit={(t) => {
            dispatch({ type: 'upsertTrip', trip: t })
            toast('Cambios guardados')
          }}
        />
      </section>

      <section className="card p-4">
        <h3 className="text-sm font-bold">Exportar</h3>
        <p className="mt-1 text-xs text-slate-500">Hoja de cálculo con todos los movimientos y la parte de cada uno, o copia de seguridad completa.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => download(`${slug(trip.name)}.csv`, tripToCsv(trip), 'text/csv;charset=utf-8')}>
            <Download size={16} /> CSV / Excel
          </Button>
          <Button variant="secondary" onClick={() => download(`${slug(trip.name)}.mochila.json`, JSON.stringify(trip, null, 2), 'application/json')}>
            <FileJson size={16} /> Copia JSON
          </Button>
        </div>
      </section>

      <Button
        variant="ghost"
        className="w-full !text-red-600"
        onClick={() => {
          if (confirm(`¿Eliminar «${trip.name}» de este dispositivo? No se puede deshacer.`)) {
            dispatch({ type: 'deleteTrip', id: trip.id })
            onDeleted()
          }
        }}
      >
        <Trash2 size={16} /> Eliminar viaje
      </Button>
    </div>
  )
}
