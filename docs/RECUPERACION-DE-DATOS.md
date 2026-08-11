# Qué hacer si se borra algo por accidente

Última revisión: **11 de agosto de 2026**

Este documento es distinto de `RECUPERACION.md` (que cubre perder una
**credencial**). Este cubre el otro escenario: alguien borra o corrompe
**datos reales** -- un cliente, una factura, un contrato, un archivo -- por
error, y hay que saber qué se puede recuperar, en cuánto tiempo, y qué NO
tiene vuelta atrás.

No se borró ni se tocó ningún dato real para escribir esto: todo lo de abajo
sale de leer cómo está configurado el proyecto, no de una prueba en vivo.

---

## Resumen rápido: qué se recupera y qué no

| Qué se perdió | ¿Se recupera? | Cómo | Ventana |
|---|---|---|---|
| Documentos de Firestore (cliente, contrato, factura, panel...) borrados o editados mal | ✅ Sí, con PITR | Restauración a un punto en el tiempo | **7 días** hacia atrás |
| Colección de Firestore borrada por completo | ✅ Sí, con PITR | Igual que arriba | 7 días |
| Un usuario de Firebase Auth (cliente o trabajador) eliminado | ❌ No hay recuperación automática | Hay que volver a crear el acceso desde cero (nueva cuenta, nuevo enlace de invitación) | Ninguna |
| Un archivo en R2 (PDF de factura, foto de campaña, avatar) borrado | ⚠️ **Sin verificar en esta sesión** | Depende de si el bucket `vista360-evidencias` tiene versionado activado en Cloudflare -- no se comprobó acá | Depende del versionado, si existe |
| `firestore.rules` / `firestore.indexes.json` mal desplegados | ✅ Sí | Están en git; se revierte el commit y se vuelve a desplegar | Ilimitada (es historial de git) |
| Código de una Cloud Function con un bug | ✅ Sí | Revertir el commit en GitHub y volver a desplegar | Ilimitada |
| Secretos (R2, Resend, etc.) borrados de Secret Manager | ✅ Sí | Ver `RECUPERACION.md` -- se regeneran y se redepliegan | Ilimitada (son regenerables, no un "backup") |

---

## Firestore: qué cubre exactamente el PITR activado

Point-in-Time Recovery quedó activado el 5 de agosto de 2026 (confirmado de
nuevo el 11 de agosto: sigue activo, sin cambios). Lo que esto compra:

- Cualquier documento de cualquier colección puede leerse **tal como estaba**
  en cualquier momento de los últimos **7 días** (es el máximo que ofrece
  Firestore; no es una opción que se pueda alargar).
- Cubre tanto un `delete()` accidental como un `update()` que sobreescribió
  datos con un valor incorrecto (un contrato editado con las fechas mal, por
  ejemplo).

**Lo que PITR NO es:** un botón de "deshacer". Restaurar significa uno de dos
caminos, ninguno instantáneo:

1. **Restaurar la base completa a un punto en el tiempo**, creando una base
   de datos nueva con esos datos (`gcloud firestore databases restore` o
   desde la consola de Firebase). Sirve para "necesito ver/recuperar todo tal
   como estaba el martes a las 3pm", pero **no se puede aplicar directo
   encima de la base en uso** sin planearlo: haría falta traer solo los
   documentos afectados desde la base restaurada hacia la real, a mano o con
   un script, para no perder lo que se escribió después del punto de
   restauración.
2. **Leer un documento puntual en un momento pasado** (vía la API con
   `readTime`), para casos chicos: "¿qué decía este contrato antes de que lo
   editaran?". Esto sí es rápido y no toca nada.

**Recomendación concreta si pasa de verdad:** para un borrado puntual (una
factura, un cliente, un contrato), el camino 2 alcanza -- leer el documento
en el momento justo antes del borrado y volver a escribirlo a mano. El
camino 1 (restaurar la base entera) es para un desastre grande, no para un
error de un clic, y conviene hacerlo con calma, no bajo presión.

---

## Firebase Auth: sin PITR, sin backup automático

Los usuarios de Firebase Auth (las cuentas de login de clientes y del equipo
interno) **no tienen recuperación de punto en el tiempo ni backup
gestionado**. Si `administrarUsuarioPortal` con acción "eliminar" borra una
cuenta -- cosa que ahora queda auditada (ver `OBSERVABILIDAD.md`) -- el uid
de Firebase Auth desaparece para siempre. El documento de `portalUsers`
asociado sí se podría recuperar vía PITR, pero de nada sirve sin la cuenta de
Auth que le da acceso.

**En la práctica:** no es tan grave como suena. Recrear el acceso es rápido
(`crearClienteAcceso` / `crearTrabajadorAcceso` generan uno nuevo en
segundos) -- lo único que se pierde es el uid viejo, no los datos del
cliente, que siguen en Firestore. Vale la pena saberlo para no perder tiempo
buscando una forma de "revivir" la cuenta exacta: no existe, y no hace falta.

---

## R2 (archivos: PDFs, fotos, avatares) — pendiente de verificar

Esto quedó **sin comprobar en esta sesión** porque requiere entrar al panel
de Cloudflare (fuera del alcance de lo que se revisó acá) y no se quiso
asumir un estado sin verlo:

- Si el bucket `vista360-evidencias` tiene **versionado de objetos**
  activado en Cloudflare R2, un archivo borrado se puede restaurar a una
  versión anterior.
- Si **no** lo tiene, borrar un objeto de R2 (o que `eliminarFactura`,
  `eliminarContrato` o `limpiarArchivosHuerfanos` borren el que no debían)
  es **definitivo**: no hay backup automático de R2 por parte de Cloudflare
  ni de este proyecto.

**Acción recomendada, no urgente:** entrar a Cloudflare → R2 →
`vista360-evidencias` → Settings, y comprobar si "Object versioning" está
activado. Si no lo está, activarlo no debería tener costo relevante para el
volumen actual (miles de archivos pequeños, no términos), pero es una
decisión de costo que corresponde confirmar antes de cambiarla, no algo para
activar sin avisar.

---

## Qué hacer en el momento (orden de pasos)

1. **No entrar en pánico ni intentar arreglarlo con prisa.** La mayoría de lo
   de arriba tiene ventana de días, no de minutos.
2. **Identificar qué se perdió exactamente**: ¿un documento de Firestore?
   ¿un archivo de R2? ¿una cuenta de Auth? Cada uno tiene un camino distinto
   (tabla de arriba).
3. Si es Firestore: anotar la hora aproximada del borrado (Cloud Logging
   tiene el evento si pasó por una función auditada -- ver
   `OBSERVABILIDAD.md`) y leer el documento en un `readTime` justo anterior.
4. Si es un archivo de R2: revisar si el versionado está activo (ver
   arriba) antes de asumir que se perdió para siempre.
5. Si es una cuenta de Auth: no buscar recuperarla -- crear el acceso de
   nuevo es más rápido y no pierde los datos del cliente.
6. Documentar qué pasó y cómo se resolvió, aunque sea en un mensaje o nota
   suelta: la próxima vez que pase (o a alguien más), ese registro ahorra
   tiempo.
