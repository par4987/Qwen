import { Download, FileJson, Link2, Share2, Trash2 } from 'lucide-react'
import { Avatar, Button, cx, toast } from '../components/ui'
import { tripToCsv } from '../lib/csv'
import { copyText, saveFile, shareText } from '../lib/platform'
import { useStore } from '../lib/store'
import { publicTrip, shareUrl } from '../lib/share'
import type { Trip } from '../lib/types'
import { GroupSection } from './GroupSection'
import { TripForm } from './TripForm'

function slug(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'viaje'
}

export function SettingsTab({ trip, onDeleted, onSyncNow }: { trip: Trip; onDeleted: () => void; onSyncNow: (force?: boolean) => Promise<void> }) {
  const { dispatch, me } = useStore()
  const myId = me[trip.id]

  const shareLink = () =>
    shareText({ title: `${trip.emoji} ${trip.name}`, text: `Copia de las cuentas de «${trip.name}» en Mochila`, url: shareUrl(trip) })
  const copyLink = () => copyText(shareUrl(trip), 'Enlace copiado')

  return (
    <div className="space-y-6">
      <GroupSection trip={trip} onSyncNow={onSyncNow} />

      <section className="card p-4">
        <h3 className="text-sm font-bold">Enviar una copia (sin sincronizar)</h3>
        <p className="mt-1 text-xs text-slate-500">
          Alternativa sin servidor: el viaje completo va dentro del enlace. Quien lo abra tendrá una copia, y si te reenvía su enlace
          actualizado, Mochila fusiona los cambios. Ojo: cualquiera con el enlace puede leer el viaje.
        </p>
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={shareLink}>
            <Share2 size={16} /> Enviar copia
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
          <Button variant="secondary" onClick={() => saveFile(`${slug(trip.name)}.csv`, tripToCsv(trip), 'text/csv;charset=utf-8')}>
            <Download size={16} /> CSV / Excel
          </Button>
          <Button variant="secondary" onClick={() => saveFile(`${slug(trip.name)}.mochila.json`, JSON.stringify(publicTrip(trip), null, 2), 'application/json')}>
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
