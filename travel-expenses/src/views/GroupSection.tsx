import qrcode from 'qrcode-generator'
import { CloudOff, Copy, KeyRound, Lock, QrCode, RefreshCw, Share2, ShieldCheck, UserX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button, Field, Sheet, cx, toast } from '../components/ui'
import { copyText, shareText } from '../lib/platform'
import { useStore } from '../lib/store'
import { createGroup, deleteGroup, encodeInvite, inviteLink, type Invite } from '../lib/sync/client'
import { safetyCode } from '../lib/sync/crypto'
import type { Trip } from '../lib/types'

const RELAY_KEY = 'mochila.relay'
export function defaultRelay(): string {
  try {
    return localStorage.getItem(RELAY_KEY) || import.meta.env.VITE_RELAY_URL || ''
  } catch {
    return import.meta.env.VITE_RELAY_URL || ''
  }
}

function ago(ts?: number) {
  if (!ts) return 'nunca'
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'hace un momento'
  if (s < 3600) return `hace ${Math.round(s / 60)} min`
  return new Date(ts).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function GroupSection({ trip, onSyncNow }: { trip: Trip; onSyncNow: (force?: boolean) => Promise<void> }) {
  const { dispatch } = useStore()
  const [relay, setRelay] = useState(defaultRelay)
  const [busy, setBusy] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [code, setCode] = useState('')
  const cfg = trip.sync

  useEffect(() => {
    if (cfg) safetyCode(cfg.groupId, cfg.secret).then(setCode)
  }, [cfg])

  const invite: Invite | null = cfg ? { relay: cfg.relay, groupId: cfg.groupId, secret: cfg.secret, name: trip.name } : null

  const enable = async () => {
    setBusy(true)
    try {
      const g = await createGroup(relay)
      try {
        localStorage.setItem(RELAY_KEY, g.relay)
      } catch {
        /* ignorar */
      }
      dispatch({ type: 'setSync', tripId: trip.id, sync: { ...g, cursor: 0 } })
      setShowInvite(true)
      toast('Grupo cifrado creado')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo crear el grupo')
    } finally {
      setBusy(false)
    }
  }

  const rotate = async () => {
    if (!cfg) return
    if (!confirm('Se creará un grupo nuevo con otra clave y el enlace actual dejará de funcionar. Tendrás que enviar la nueva invitación a quienes deban seguir. ¿Continuar?')) return
    setBusy(true)
    try {
      const g = await createGroup(cfg.relay)
      dispatch({ type: 'setSync', tripId: trip.id, sync: { ...g, cursor: 0 } })
      deleteGroup(cfg).catch(() => {})
      setShowInvite(true)
      toast('Acceso renovado: comparte la nueva invitación')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo renovar')
    } finally {
      setBusy(false)
    }
  }

  const leave = () => {
    if (!cfg) return
    if (!confirm('Este dispositivo dejará de sincronizar este viaje (conservarás tu copia). ¿Continuar?')) return
    dispatch({ type: 'setSync', tripId: trip.id, sync: undefined })
  }

  if (!cfg)
    return (
      <section className="card p-4">
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-brand-600" />
          <h3 className="text-sm font-bold">Grupo compartido cifrado</h3>
        </div>
        <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
          <li>🔐 Cifrado de extremo a extremo (AES-256-GCM): el servidor sólo guarda datos ilegibles.</li>
          <li>✍️ Cada cambio va firmado por el móvil que lo hizo: nadie puede suplantar a otro.</li>
          <li>🔄 Los cambios de todos se sincronizan solos y funcionan sin conexión.</li>
          <li>🚪 Puedes renovar la clave en cualquier momento para expulsar a alguien.</li>
        </ul>
        <div className="mt-3">
          <Field label="Servidor de sincronización" hint="Puedes usar tu propio servidor (ver carpeta relay/). Debe ser https://">
            <input className="input" placeholder="https://relay.tudominio.com" value={relay} onChange={(e) => setRelay(e.target.value)} inputMode="url" autoCapitalize="off" />
          </Field>
        </div>
        <Button className="mt-3 w-full" onClick={enable} disabled={busy || !relay.trim()}>
          <ShieldCheck size={16} /> {busy ? 'Creando…' : 'Crear grupo cifrado'}
        </Button>
      </section>
    )

  return (
    <section className="card p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-emerald-600" />
        <h3 className="flex-1 text-sm font-bold">Grupo compartido cifrado</h3>
        <span
          className={cx(
            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
            cfg.revoked ? 'bg-rose-100 text-rose-700' : cfg.lastError ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700',
          )}
        >
          {cfg.revoked ? 'Sin acceso' : cfg.lastError ? 'Con avisos' : 'Activo'}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Última sincronización: {ago(cfg.lastSyncAt)} · {new URL(cfg.relay).host}
      </p>
      {cfg.lastError && <p className={cx('mt-2 rounded-lg px-3 py-2 text-xs', cfg.revoked ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200')}>
        {cfg.lastError}
        {cfg.revoked && '. Si alguien renovó el acceso, pídele la nueva invitación.'}
      </p>}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={() => setShowInvite(true)} disabled={cfg.revoked}>
          <QrCode size={16} /> Invitar
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await onSyncNow(true)
            setBusy(false)
          }}
        >
          <RefreshCw size={16} className={busy ? 'animate-spin' : ''} /> Sincronizar
        </Button>
      </div>

      <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <KeyRound size={14} /> Código de seguridad
        </p>
        <p className="tabular mt-1 font-mono text-lg tracking-wider">{code}</p>
        <p className="text-[11px] text-slate-500">Comparadlo en persona: si todos veis el mismo código, nadie ha interceptado la invitación.</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" className="!px-2 !py-1.5 text-xs" onClick={rotate} disabled={busy || cfg.revoked}>
          <UserX size={14} /> Renovar acceso (expulsar)
        </Button>
        <Button variant="ghost" className="!px-2 !py-1.5 text-xs" onClick={leave}>
          <CloudOff size={14} /> Dejar de sincronizar
        </Button>
      </div>

      {showInvite && invite && <InviteSheet invite={invite} onClose={() => setShowInvite(false)} />}
    </section>
  )
}

function InviteSheet({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  const link = inviteLink(invite)
  const code = encodeInvite(invite)
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(link)
    qr.make()
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
  }, [link])

  return (
    <Sheet open onClose={onClose} title="Invitar al grupo">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        La forma más segura es que escaneen este QR <b>en persona</b>. También puedes enviar el enlace por un chat cifrado (WhatsApp, Signal…).
      </p>
      <div className="mx-auto my-4 w-56 rounded-2xl bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="grid gap-2">
        <Button onClick={() => shareText({ title: 'Invitación a Mochila', text: `Únete a «${invite.name}» en Mochila (gastos compartidos cifrados):`, url: link })}>
          <Share2 size={16} /> Enviar invitación
        </Button>
        <Button variant="secondary" onClick={() => copyText(code, 'Código copiado')}>
          <Copy size={16} /> Copiar código
        </Button>
      </div>
      <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        ⚠️ Quien tenga esta invitación podrá ver y editar los gastos del viaje. No la publiques en grupos abiertos ni redes sociales.
      </p>
    </Sheet>
  )
}
