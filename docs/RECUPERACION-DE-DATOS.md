# Qué hacer si se borra algo por accidente

Última revisión: **11 de agosto de 2026** (sección de R2 verificada en vivo
contra el dashboard de Cloudflare ese mismo día -- ya no es "pendiente de
verificar")

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
| Un archivo en R2 (PDF de factura, foto de campaña, avatar) borrado | ✅ Sí, desde el 11-ago-2026 | Se guarda una copia en `_papelera/` dentro del mismo bucket antes de cada borrado real | **30 días** |
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

## R2 (archivos: PDFs, fotos, avatares) — verificado en vivo el 11-ago-2026

Se entró al dashboard de Cloudflare y se revisó el bucket real que usa
Vista360 Player: **`vista360-evidencias`** (13 objetos, 1.59 MB al momento
de revisar, creado el 16-jul-2026). No se borró ni se sobrescribió ningún
objeto real para esta comprobación -- todo lo de abajo sale de mirar la
configuración del bucket (pestaña Settings) y la documentación pública de
Cloudflare.

**Lo que se comprobó, uno por uno:**

| Pregunta | Respuesta |
|---|---|
| ¿Existe versionado de objetos? | **No.** No hay ninguna sección de versionado en Settings. Cloudflare confirma en su propia documentación que sigue en el roadmap, no disponible aún (ago-2026). |
| ¿Existe recuperación nativa de archivos eliminados? | **No**, por la misma razón -- sin versionado no hay a qué volver. |
| ¿Existe retención? | Existe **Bucket Lock Rules** (bloquear borrados/sobrescrituras durante un plazo), pero **no se activó**: bloquearía también los borrados legítimos que la propia app hace a propósito (`eliminarFactura`, `eliminarContrato`, limpieza de huérfanos) -- convertiría una función real en un error confuso durante el plazo de bloqueo. No es la herramienta correcta para este caso. |
| ¿Existen lifecycle rules? | Sí, la funcionalidad existe y ya se usaba (`Default Multipart Abort Rule`, cancela subidas incompletas a los 7 días). Se agregó una regla nueva, ver más abajo. |
| ¿Qué ocurre al sobrescribir un objeto? | R2 reemplaza el contenido sin dejar rastro de la versión anterior (esperable sin versionado). La app ya gestiona esto por su cuenta: cada subida genera una key única (`nuevaKey()` en `r2Storage.ts`), así que "sobrescribir" en la práctica es "subir una key nueva y borrar la vieja" -- nunca un PUT sobre la misma key. |
| ¿Qué ocurre al eliminar un objeto? | Hasta el 11-ago-2026: desaparecía al instante, sin posibilidad de recuperación. **A partir de este cambio:** primero se copia a `_papelera/` (dentro del mismo bucket) y recién después se borra el original. |
| ¿Cuánto tiempo hay para recuperarlo? | **30 días** -- la copia en `_papelera/` se borra sola pasado ese plazo (regla de ciclo de vida `papelera-30-dias`, ver abajo). |
| ¿Activar protección tiene costo significativo? | No. La copia solo ocurre en el momento de un borrado real (no en cada subida, no on los 13 objetos existentes de una sola vez), y el volumen actual (1.59 MB, decenas de operaciones al mes) hace que el costo adicional sea despreciable. La regla de ciclo de vida no tiene costo propio -- solo acota cuánto dura la copia. |

### La solución implementada: papelera con expiración de 30 días

Como R2 no ofrece versionado nativo, se implementó la alternativa mínima
razonable, en dos partes:

1. **Código** (`functions/src/r2Storage.ts`, función `borrarObjetoR2` --
   el único punto por el que pasan los 8 lugares que borran algo de R2:
   facturas, contratos, reportes, solicitudes de campaña, avatares/fotos
   reemplazadas, y la limpieza de huérfanos). Antes de borrar, copia el
   objeto a `_papelera/{key original}` dentro del mismo bucket. Si la
   copia falla (por ejemplo, la key ya no existía), el borrado se intenta
   igual -- mismo comportamiento "a mejor esfuerzo" que ya tenía la
   función.
2. **Regla de ciclo de vida en Cloudflare** (`papelera-30-dias`, activada
   en el bucket `vista360-evidencias`): borra automáticamente todo lo que
   haya bajo el prefijo `_papelera/` pasados 30 días.

**Por qué esto y no duplicar todo:** solo se copia lo que de verdad se
borra -- no los 13 objetos existentes, no cada subida nueva -- y la copia
tiene fecha de caducidad. No es "backup completo del bucket", es una red
de seguridad acotada para el caso real que importa: alguien borra algo por
error y lo necesita de vuelta.

**`_papelera/` queda fuera del alcance normal de la app a propósito:**
ninguna de las carpetas permitidas (`CARPETAS_PERMITIDAS` en
`r2Storage.ts`) incluye `_papelera/`, así que `firmarUrlsR2` y
`obtenerArchivoR2Base64` no pueden leer ni firmar URLs hacia ahí -- un
cliente o un Trabajador nunca ve ni puede llegar a esa carpeta. Solo es
alcanzable a mano, con el Admin SDK (o desde el propio dashboard de
Cloudflare), que es justo lo que hace falta para una recuperación real.

### Cómo recuperar un archivo de la papelera, paso a paso

**Desde el 11 de agosto de 2026, esto ya NO requiere entrar a Cloudflare.**
Vista360 Player → menú del Gerente ("Centro de gestión") → **Papelera** →
buscar el archivo en la lista → **Restaurar**. La pantalla (Gerente/Admin
únicamente; ver `functions/src/papeleraR2.ts`) muestra tipo de archivo,
cliente relacionado si se puede determinar, ruta original, fecha de
borrado, tamaño y días restantes antes de que expire, y hace exactamente
los mismos pasos descritos abajo del lado del servidor -- con la ruta de
destino derivada siempre de la propia key de la papelera (nunca aceptada
tal cual del navegador), validada contra las carpetas permitidas antes de
escribir, y sin sobrescribir un archivo que ya exista en el destino.

1. En **Papelera**, ubicar el archivo (por tipo, ruta o cliente) y tocar
   **Restaurar**.
2. Si la pantalla muestra el aviso **"Este elemento requiere recuperación
   adicional de datos."**, el archivo vuelve a R2 pero el documento de
   Firestore relacionado (factura, contrato, reporte...) ya no existe --
   hace falta además recuperarlo vía PITR (ver la sección de Firestore
   más arriba) para que la app vuelva a "verlo" como antes.
3. Si pasaron más de 30 días: la copia ya no existe y la pantalla no la
   va a listar. No hay forma de recuperarlo -- esta es la ventana real,
   no una aproximación.
4. Toda restauración queda auditada (evento `archivo_restaurado_papelera`
   en Cloud Logging: quién, qué archivo, cuándo, cliente relacionado).

**Alternativa manual (si Vista360 Player no está disponible):** entrar al
dashboard de Cloudflare → R2 → `vista360-evidencias` → Objects → buscar por
prefijo `_papelera/` + la ruta original, y copiar el objeto de vuelta a su
key original (quitando el prefijo `_papelera/`) con el propio dashboard o
un script con el Admin SDK. No hace falta en el uso normal -- queda como
respaldo si las Cloud Functions estuvieran caídas.

No existe un botón de "eliminar definitivamente" desde la papelera --
la decisión fue no añadir una segunda forma de borrar algo por accidente:
se confía en la regla de ciclo de vida de 30 días de Cloudflare para que
desaparezca sola.

### Revisado de paso: archivos huérfanos y eliminaciones automáticas

Se revisó (sin hacer una auditoría general nueva) si algo borra archivos
de R2 **solo, sin que nadie lo dispare**: no existe. `limpiarArchivosHuerfanos`
y `contarEvidenciasHuerfanas` son funciones `onCall` (las dispara una
persona desde la interfaz, no un cron), `limpiarArchivosHuerfanos` no
borra nada por defecto (hay que pasarle `confirmar: true` explícitamente)
y respeta un margen de 24 horas de gracia para no borrar una subida que
todavía está en curso. Ningún `onSchedule` del proyecto toca R2. No se
encontró ningún camino de borrado automático sin intervención humana.
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
