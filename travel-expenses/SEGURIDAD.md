# Grupos compartidos: diseño de seguridad

Objetivo: que varios viajeros compartan y editen el mismo viaje desde sus móviles **sin cuentas**, y que
**ni el servidor ni nadie que intercepte el tráfico pueda leer o modificar** los gastos.

## Resumen

| Amenaza | Defensa |
|---|---|
| El servidor (o quien lo hackee) lee los gastos | Cifrado de extremo a extremo AES-256-GCM. La clave sólo existe en los móviles. El servidor guarda blobs opacos. |
| Alguien sin invitación lee o escribe en el grupo | Cada petición lleva un token derivado del secreto del grupo; el servidor sólo guarda su SHA-256 y responde 401 a todo lo demás (sin revelar si el grupo existe). |
| El servidor modifica, reordena o inyecta datos | AES-GCM autentica cada blob, con el grupo y el dispositivo como datos asociados; cualquier cambio de un bit se rechaza. |
| Un miembro se hace pasar por otro | Cada móvil firma sus datos con su clave ECDSA P-256. El identificador del dispositivo **es** la huella de su clave pública, así que no se puede usar el de otro. La clave privada es no exportable (WebCrypto + IndexedDB). |
| Alguien intercepta la invitación por el camino | La invitación se comparte en persona (QR) o por un chat cifrado. El **código de seguridad** (16 cifras) permite comprobar en persona que todos tienen la misma clave. |
| Hay que expulsar a alguien | *Renovar acceso*: se crea un grupo nuevo con otra clave y se borra el anterior. Quien no reciba la nueva invitación deja de recibir cambios. |
| Robo de copias de seguridad / migración del móvil | `allowBackup=false` y reglas de extracción: los datos y secretos no se copian a la nube ni a otro móvil. |
| Ataques de red (proxy malicioso, CA instalada por el usuario) | Sólo HTTPS y sólo CAs del sistema (`network_security_config.xml`). El cliente rechaza servidores `http://` salvo los locales de desarrollo. |
| Abuso del servidor | Límite de peticiones por IP, tamaño máximo por blob, dispositivos máximos por grupo, borrado de grupos inactivos. |

## Claves

```
secreto del grupo  (32 bytes aleatorios, va en la invitación)
   │  HKDF-SHA256, salt = "mochila/v1|<groupId>"
   ├── info "mochila/v1/enc"  → clave AES-256-GCM       (nunca sale del móvil)
   └── info "mochila/v1/auth" → token de acceso          (el servidor guarda SHA-256(token))

identidad del dispositivo: ECDSA P-256 (clave privada no exportable)
   deviceId = base64url(SHA-256(JWK pública canónica)[0..16])
```

## Invitación

`https://<servidor>/join#MOCHILA1.<base64url({servidor, groupId, secreto, nombre})>`

Todo lo que va tras `#` lo procesa el móvil y **nunca se envía al servidor** (los navegadores no mandan el
fragmento). La página `/join` sólo redirige a `mochila://join#…`, que abre la app.

## Protocolo de sincronización

Cada dispositivo mantiene **una** instantánea en el servidor (`PUT /v1/g/<grupo>/d/<dispositivo>`),
que reemplaza en cada cambio:

```
blob = iv(12) ‖ AES-GCM(clave, iv, aad="mochila/v1|aad|<grupo>|<dispositivo>",
                         JSON{ deviceId, pub, body = lz(viaje), sig = ECDSA(body…) })
```

Los demás piden lo nuevo (`GET /v1/g/<grupo>?after=<versión>`), descifran, verifican y fusionan.
La fusión es conmutativa y determinista (última edición gana por gasto, con registro de borrados), de
modo que todos convergen al mismo estado sin importar el orden y cualquiera puede reconstruir el viaje
aunque el creador esté desconectado. Todo funciona sin conexión: los cambios se suben al volver la red.

## Lo que el servidor sí ve (metadatos)

- Que existe un grupo, cuántos dispositivos tiene y cuándo y cuánto escriben (tamaño de los blobs).
- Las IP de quienes se conectan.

Si el servidor se despliega en Cloudflare Workers, Cloudflare (como proveedor) ve lo mismo que el servidor:
sólo blobs cifrados y metadatos de conexión. La clave nunca sale de los móviles, así que tampoco puede leer los gastos.

No ve nombres, importes, conceptos, monedas, fechas de los gastos ni el nombre del viaje.

## Limitaciones conocidas y siguientes pasos

- Cualquier miembro con la invitación puede editar o borrar gastos (como en cualquier app de gastos
  compartidos). Las firmas permiten saber qué dispositivo hizo cada versión; un historial de auditoría
  visible sería un siguiente paso natural.
- Un servidor malicioso podría *ocultar* instantáneas recientes (no puede falsificarlas). Mitigación
  posible: contador monotónico firmado por dispositivo y aviso si retrocede.
- El secreto del grupo se guarda en el almacenamiento privado de la app (sandbox de Android). Para un
  nivel extra se puede envolver con una clave del Android Keystore (plugin de almacenamiento seguro).
- Expulsar a alguien no borra lo que ya descargó: sólo impide que reciba cambios nuevos.
