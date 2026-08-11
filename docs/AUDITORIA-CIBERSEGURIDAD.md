# Auditoría final de ciberseguridad — Vista360 Player

Fecha: agosto 2026. Alcance: repositorio completo (frontend React/PWA, Cloud Functions, Firestore Rules, Cloudflare R2, GitHub Actions, dependencias). Metodología: ENCONTRAR → DEMOSTRAR → CLASIFICAR → CORREGIR SI MERECE LA PENA → PROBAR → DESPLEGAR → ATACAR DE NUEVO. Principio rector: el frontend está completamente comprometido — toda autorización real se verificó del lado del servidor (Firestore Rules, Cloud Functions, Firebase Auth), nunca en si un botón está oculto.

## Threat model específico de Vista360

```
React/PWA (DevTools abierto, JS modificable, requests fabricados)
   │
   ├─→ Firebase Authentication  (¿se puede robar/falsificar/persistir una sesión?)
   │
   ├─→ Firestore                (¿las Rules impiden leer/escribir lo ajeno, sin depender de la UI?)
   │
   ├─→ Cloud Functions          (Admin SDK — SE SALTA LAS RULES. Si una function confía en un
   │                             id/rol que llega del navegador sin revalidarlo, es la puerta
   │                             más peligrosa del sistema entero)
   │
   └─→ Cloudflare R2            (archivos privados: facturas, avatares, fotos, reportes.
                                  Una key válida no debe ser sinónimo de "autorizado")
```

Los actores relevantes: **no autenticado**, **Cliente** (dueño de un `clienteId`), **Trabajador** (personal interno, permisos intermedios), **Gerente/admin** (control total). El riesgo más caro de todos no es que alguien lea un dato ajeno — es que una Cloud Function con Admin SDK ejecute una acción **destructiva** (borrar un archivo, borrar un contrato) sin haber comprobado auth/rol antes. Eso fue exactamente lo que se encontró (ver P0).

---

## Tabla de hallazgos

| Vector | Ataque probado | Resultado antes | Corrección | Test | Producción |
|---|---|---|---|---|---|
| `generarReporteCliente` (Cloud Function) | Llamar sin sesión con `panelesFotos[].fotos[].url` apuntando a la key de R2 de OTRO cliente | **Se borraba igual** — la recolección de claves y el `finally` que ejecuta `borrarObjetoR2` corrían fuera del bloque que valida `auth`/rol | Auth y rol se comprueban ANTES de tocar `request.data`; la recolección de claves y el try/finally quedan después | `generarReporteClienteSeguridad.test.ts` (5 tests, mutado) | ✅ Desplegado y verificado |
| `administrarUsuarioPortal` (archivar) + `firestore.rules` | Archivar una cuenta y comprobar si un token ya emitido seguía leyendo Firestore | `disabled:true` no revoca sesiones activas; ninguna Rule miraba `archived` | `revokeRefreshTokens(uid)` al archivar/eliminar; `esCuentaDePortal()` ahora exige `archived != true` | `revocacionSesionArchivado.test.ts` (3 tests) + `cuentaArchivada.test.ts` contra el emulador (5 tests), ambos mutados | ✅ Desplegado y verificado |
| `listarReportesCliente`, `firmarUrlsR2`, `resumenOcupacion`, `restablecerPasswordCliente`, `enviarCorreoConPdf` | Simular llamadas en bucle (sin ejecutar tráfico real) | Sin `exigirRitmo`: nada impedía amplificar lecturas de Firestore, firmas de R2, envíos de correo o resets de contraseña | `exigirRitmo(uid, "<operación>", N)` agregado a las cinco | `limiteDeRitmoNuevasFunciones.test.ts` (5 tests, uno mutado como muestra) | ✅ Desplegado y verificado |
| Login (`src/utils/errores.ts`) | Comparar el mensaje de `wrong-password` vs `user-not-found` | Mensajes distintos → enumeración de qué correos tienen cuenta | Los tres códigos (`wrong-password`, `user-not-found`, `invalid-credential`) dan el mismo mensaje | `errores.test.ts` (actualizado, mutado) | ✅ Desplegado |
| `esKeyValida` (R2) | Key de 10.000+ caracteres / con bytes de control o nulos | Se aceptaba (sin tope de largo ni filtro de caracteres) | Tope de 512 caracteres + rechazo de bytes `\x00`-`\x1f`/`\x7f` | `seguridadEntradas.test.ts` (extendido) | ✅ Desplegado |
| GitHub Actions (6 workflows) | Revisar si una Action de terceros podía cambiar de código sin aviso (clase tj-actions/changed-files) | Las 4 Actions usadas (`checkout`, `setup-node`, `upload-artifact`, `setup-java`) referenciadas por etiqueta móvil `@v5`; 4 de 6 workflows sin bloque `permissions:`; uno con `contents: write` sin usarlo (dejaba un `git push --force` roto sin efecto real) | Las 4 Actions fijadas a su commit exacto (`@<sha> # v5`); los 6 workflows con `permissions: contents: read` explícito; el push roto reemplazado por subida de artefacto | `segurudadGithubActions.test.ts` (5 tests, uno mutado como muestra) | ✅ Desplegado y verificado — el propio run de despliegue de esta auditoría (run 31543080737) ya corrió con las Actions fijadas por SHA y `permissions: contents: read` |
| `firmarDescargaFactura`, `firmarUrlsR2`, `obtenerArchivoR2Base64` | Cliente A pidiendo la key de la factura/foto de Cliente B | **Ya bloqueado antes de esta auditoría** — cada uno resuelve el dueño real desde Firestore, no confía en la key | Sin cambios — VERIFICADO, NO TOCAR | Cobertura ya existente | N/A |
| `firestore.rules` completo | Matriz Rol × Colección × operación, incl. escalar a admin escribiendo `portalUsers` propio | **Ya bloqueado antes de esta auditoría** — escritura del navegador cerrada por completo (`allow write: if false` en todo el archivo) | Sin cambios — VERIFICADO, NO TOCAR | 75 tests ya existentes contra el emulador | N/A |
| Papelera de R2 (`listarPapelera`, `restaurarDePapelera`) | Trabajador/Cliente listando o restaurando; Gerente con traversal o destino manipulado | **Ya bloqueado antes de esta auditoría** — `exigirGerente` (no `esPersonalInterno`), destino derivado 100% server-side, protección anti-sobrescritura | Sin cambios — VERIFICADO, NO TOCAR | Cobertura ya existente | N/A |

---

## P0 — compromiso total / fuga masiva / admin

**`generarReporteCliente`: borrado de archivos de R2 sin autenticación.** EXPLOTABLE EN PRODUCCIÓN antes de esta revisión. Un atacante sin ninguna sesión podía enviar `{ panelesFotos: [{ fotos: [{ url: "vista360/facturas/<key-de-otro-cliente>.pdf" }] }] }`; la función recolectaba esa key en `clavesTemporales` antes de comprobar `request.auth`, y el bloque `finally` — que se ejecuta siempre, incluso cuando el `try` lanza `unauthenticated` — borraba el objeto de R2 igual. Alcance: cualquier archivo bajo `vista360/facturas/`, `vista360/avatares/` o `vista360/campanas/` cuya key el atacante conociera o adivinara, de cualquier cliente. **Corregido y desplegado** (ver tabla).

## P1 — acceso indebido serio

**Archivar/deshabilitar una cuenta no cortaba una sesión ya iniciada.** Relevante directamente para el playbook de incidentes: si mañana se compromete una cuenta Gerente, "archivarla" ponía `disabled:true` en Firebase Auth, pero un token ya emitido seguía funcionando contra Firestore (nadie comprobaba el campo `archived`) hasta que expirara solo — hasta 1 hora. **Corregido**: se revoca el refresh token al archivar/eliminar, y Firestore Rules ahora cortan el acceso de una cuenta archivada de inmediato, sin esperar la expiración del token. Queda una ventana residual angosta y documentada (algunas Cloud Functions individuales no revalidan `archived`, solo el rol) — ver el playbook de incidentes para el detalle y la razón de no cerrarla en esta misma pasada.

## P2 — abuso limitado / costo / datos parciales

- **Cinco Cloud Functions sin límite de ritmo** en operaciones caras (firmar hasta 60 URLs de R2 por llamada, leer todas las facturas de la historia del negocio, enviar correo a cualquier destinatario, resetear contraseñas). Ninguna permitía leer/modificar datos ajenos — el riesgo es de **costo y disponibilidad** (OWASP API4:2023, Unrestricted Resource Consumption), no de confidencialidad. Corregido con `exigirRitmo` en las cinco.
- **Enumeración de usuarios en el login.** Mensajes de error distintos para "contraseña incorrecta" y "no existe esa cuenta" permitían, en teoría, construir una lista de qué correos tienen cuenta en Vista360 sin adivinar ninguna contraseña. Corregido: mensaje único.

## P3 — hardening / defensa adicional

- **Cadena de suministro de GitHub Actions**: Actions de terceros sin fijar a un commit exacto (clase de ataque tj-actions/changed-files, marzo 2025), workflows sin `permissions:` mínimos explícitos, un `git push --force` roto y sin efecto real. Corregido — ver tabla.
- **`esKeyValida` sin tope de largo ni filtro de caracteres de control.** No era explotable como traversal real (R2 no tiene un filesystem que recorrer), pero es entrada sin validar. Corregido con un tope razonable.
- **`actualizarAvatarPropio`/`actualizarAvatarCliente` validan la nueva `avatarUrl` con la lista blanca genérica de 3 carpetas, no restringida a `vista360/avatares/`.** No es explotable hoy porque `firmarUrlsR2` vuelve a comprobar la propiedad real al firmar, sin importar qué diga el campo `avatarUrl` — pero es una trampa latente si una función futura llegara a confiar en ese campo directamente. **NO CORREGIDO** (bajo el criterio ahorro/complejidad/riesgo: el ahorro de seguridad es marginal porque ya hay una capa que lo cubre, y tocar la validación de tres funciones distintas para un riesgo hoy inexistente no se justifica). Queda documentado para quien toque esas funciones después.
- **Firebase App Check: NO CONFIGURADO, por lo tanto NO ENFORCED.** No hay ninguna referencia a App Check en todo el repo (frontend ni Functions). Esto significa que, aunque cada Cloud Function valida auth/rol/propiedad correctamente, nada impide que un cliente HTTP arbitrario (no el navegador real de la PWA) llame a las Functions con un token de Firebase Auth válido pero fuera de la aplicación real — Firebase/Google documentan App Check específicamente para cerrar ese hueco (Cloud Functions Callable, Firestore, Cloud Storage lo soportan hoy). **NO SE ACTIVÓ** en esta revisión, tal como se pidió explícitamente ("no lo actives a ciegas"). Diseño de migración segura propuesto abajo.
- **Sin Content-Security-Policy ni Strict-Transport-Security en producción.** `public/_headers` ya trae `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` y `Permissions-Policy` — buena base. CSP está deliberadamente diferida (comentario propio del código: "una CSP mal armada puede romper Firebase/R2 en silencio"). **NO SE IMPLEMENTÓ** en esta pasada por la misma razón que App Check: requiere enumerar con cuidado cada origen que Firebase/R2/Leaflet/Resend necesitan y probarlo en modo Report-Only antes de exigirlo, que es un proyecto propio, no un cambio de una línea. Propuesta abajo.
- **No se pudo verificar desde el código si el bucket de R2 tiene "acceso público" desactivado en el panel de Cloudflare**, ni la configuración exacta de CORS del bucket — son ajustes de cuenta, no representados en ningún archivo del repositorio. Toda la evidencia de código indica que el acceso es privado por diseño (cero URLs públicas construidas en el código; todo pasa por `firmarLecturaR2`/`firmarSubidaR2` con SigV4), pero esto es una inferencia desde el código, no una confirmación del panel. **Recomendado**: confirmar directamente en el dashboard de Cloudflare R2 que "Public Access" está deshabilitado para el bucket `vista360-evidencias`.

## Ataques que intentamos y fallaron (lo importante: qué NO se pudo romper)

- **IDOR en `firmarDescargaFactura`**: enviar la key real de la factura de Cliente B mientras se está autenticado como Cliente A. Falla con `permission-denied` — la función resuelve el dueño real desde el documento `facturas` (por `cliente_id` o RUC), no confía en que la key "parezca" válida.
- **IDOR en `firmarUrlsR2`**: pedir firmar keys de facturas/campañas ajenas. Falla — se filtra contra `agregados/facturas-{clienteId}` y los contratos propios del caller antes de firmar nada.
- **Escritura directa de `role`/`clienteId`/`isAdmin` en `portalUsers/{uid}` propio** desde la consola del navegador. Falla — `firestore.rules` tiene `allow write: if false` total sobre esa colección, sin excepciones por campo.
- **Lectura de datos de otro cliente vía Firestore directo** (`get()` puntual y `list()`/query con filtro forjado) en `contratos`, `facturas`, `clientes`, `informesCliente`, `solicitudesCampana`, `portalUsers`, `invitacionesPortal`. Falla en los siete — cada Rule deriva el `clienteId` del caller desde su propio documento `portalUsers` (server-side), nunca del filtro de la consulta.
- **Path traversal en keys de R2** (`../../etc/passwd`, `%2e%2e%2f` sin decodificar, backslashes, unicode, el bug clásico de `startsWith("vista360/facturasXXXX/")` colándose como si fuera `vista360/facturas/`). Los ocho payloads probados fallan contra la validación real de `esKeyValida` — el `startsWith` incluye la barra final, así que no hay confusión de prefijo.
- **Restaurar una key arbitraria de la Papelera, o forzar un destino distinto al original.** Falla — el destino se deriva 100% del lado del servidor a partir de la propia key de la papelera; el cliente nunca puede mandar un destino.
- **Trabajador usando la Papelera, o leyendo/escribiendo operaciones exclusivas de Gerente** (eliminar panel, resolver solicitudes, listar personal interno). Falla en todos los casos probados — cada uno exige `esGerente`/rol `admin` explícito, comprobado en vivo contra Firestore, no cacheado.
- **Cambiar el rol a "admin" en `localStorage` y esperar que alguna acción privilegiada se autorice con eso.** No hay ningún camino: ninguna Cloud Function ni Rule lee un valor de rol que no sea el que está, en ese instante, en el documento `portalUsers/{uid}` real.
- **Confundir "$0 en factura(s) sin `pagado`" filtrando con `where("pagado","==",false)` en `resumenOcupacion`** (evaluado como posible optimización en la revisión de escalabilidad, no de seguridad) — se decidió expresamente NO aplicarlo: dejaría fuera en silencio facturas sin ese campo, que el código de hoy sí trata como pendientes. Mencionado acá porque es exactamente el tipo de "arreglo" que introduce un bug de seguridad de datos (ocultar información real) disfrazado de optimización.
- **XSS vía popup de Leaflet** (`<img src=x onerror=alert(1)>` como nombre de panel/dirección/cliente). Falla — `escapeHtml()` se aplica a todo interpolado, con test dedicado que parsea el HTML resultante y confirma que no sobrevive ningún elemento ejecutable.
- **Secretos reales en el bundle de frontend construido.** Ninguno encontrado — solo nombres de propiedad de librerías (React DevTools internals, campos OAuth de Firebase Auth) que coinciden por casualidad con la palabra "secret".

---

## Por área

### FIRESTORE
Sin escritura desde el navegador en ninguna colección (`allow write: if false` total). Toda lectura deriva la identidad del caller desde su propio documento `portalUsers`, nunca de lo que pida la consulta. Único cambio de esta auditoría: `esCuentaDePortal()` ahora exige `archived != true`. 8 índices compuestos, 7 confirmados en uso con cita exacta de dónde se usan, 1 marcado para revisión humana (no se borra sin evidencia).

### FUNCTIONS
Inventario completo de ~50 funciones exportadas. Un hallazgo P0 (`generarReporteCliente`, corregido). El resto valida auth + rol + propiedad del recurso de forma consistente, usando `exigirId`/`esKeyValida` para no confiar en IDs/keys crudos. Cinco funciones sin límite de ritmo, corregidas.

### AUTH
No hay recuperación de contraseña autoservicio (solo reseteo por un admin) — reduce la superficie de enumeración vía ese flujo específico, aunque el login normal sí la tenía (corregido). El cambio de contraseña propio re-autentica antes de aplicar el cambio. Gap real encontrado y corregido: revocación de sesión al archivar/deshabilitar una cuenta.

### R2
Validación de key contra lista blanca de carpetas correctamente implementada (sin el bug clásico de confusión de prefijo). Toda lectura/escritura/borrado de un archivo específico se resuelve contra el documento de Firestore que demuestra la propiedad, no contra la key en sí. URLs firmadas con alcance de un solo objeto, expiración real (6h lectura, 10min subida, 7 días avatares), nunca logueadas completas. Papelera con destino 100% server-derivado y protección anti-sobrescritura. Gap de configuración de cuenta (público/privado, CORS) no verificable desde el código — recomendado confirmar en el dashboard.

### PWA
Service worker con alcance de caché deliberadamente angosto (nunca cachea respuestas cross-origin ni autenticadas). Logout limpia localStorage sensible, cachés del navegador y notifica al service worker. Ningún dato de un usuario quedó accesible al siguiente en las pruebas realizadas.

### SUPPLY CHAIN
0 vulnerabilidades HIGH/CRITICAL en dependencias de producción (root y functions). Sin scripts `preinstall`/`postinstall` sospechosos. Sin secretos hardcodeados en el repositorio ni en el bundle construido. GitHub Actions corregido (ver tabla) — máxima prioridad de esta categoría según la guía 2026 de supply-chain de GitHub Actions, ya aplicada.

### IAM
El Admin SDK de Cloud Functions se salta las Firestore Rules por diseño — por eso el foco principal de esta auditoría estuvo en la validación DENTRO de cada función, no solo en las Rules. Los deploys usan una cuenta de servicio vía secret de repositorio; el despliegue de reglas de Firestore requiere un flag explícito adicional (`desplegar_reglas`), defensa contra publicar reglas rotas sin querer.

### COST ATTACKS
Cinco funciones identificadas y corregidas con límite de ritmo (ver tabla). El resto de operaciones "caras" de la auditoría de escalabilidad previa (regeneración de agregados, lectura completa de facturas en `resumenOcupacion`) ya tienen avisos de umbral desde la revisión anterior; esta auditoría les agregó además el límite de ritmo por uid donde faltaba.

---

## ¿Qué podría hacer hoy un atacante NO autenticado?

Antes de esta revisión: borrar cualquier archivo de R2 (facturas, avatares, fotos de campaña) de cualquier cliente, sin sesión, vía `generarReporteCliente`. **Ya corregido.** Después de la corrección: nada — todas las operaciones sensibles exigen `request.auth?.uid` verificado antes de tocar cualquier dato, y ninguna Rule de Firestore permite lectura sin sesión.

## ¿Qué podría hacer un Cliente malicioso?

Leer y modificar únicamente lo que su propio `clienteId` autoriza — cada intento de acceder a datos de otro cliente (facturas, contratos, informes, R2) probado en esta auditoría fue rechazado, con la identidad resuelta del lado del servidor. Podría, en teoría (antes de esta corrección), llamar en bucle a `listarReportesCliente`/`firmarUrlsR2` para generar costo — ya limitado por ritmo.

## ¿Qué podría hacer un Trabajador malicioso?

Crear/editar paneles y contratos (quedan en cola de aprobación del Gerente, salvo la creación directa), pero no eliminar paneles/facturas ni usar la Papelera — ambos exclusivos de Gerente, comprobado en código, no solo en la UI. Puede solicitar la eliminación de cualquier cuenta (incluida una Gerente), pero requiere aprobación explícita de un Gerente.

## ¿Qué pasaría si roban una cuenta Gerente?

Ver el playbook de incidentes completo (`docs/INCIDENT-RESPONSE-PLAYBOOK.md`). Resumen: puede archivar/eliminar clientes, paneles, solicitudes y cuentas de personal, restablecer contraseñas de clientes, restaurar archivos de la Papelera, y enviar correo a cualquier destinatario. PITR (Firestore, ~7 días) y la Papelera de R2 (30 días) cubren la mayoría de los borrados. Desde esta revisión, archivar la cuenta corta el acceso a Firestore de inmediato (antes tardaba hasta una hora); queda una ventana residual angosta a nivel de Cloud Functions individuales, documentada como próximo paso.

## ¿Cuáles son las 5 defensas más importantes de Vista360?

1. Cero escritura del navegador a Firestore — toda mutación pasa por una Cloud Function que valida del lado del servidor.
2. Cada función que recibe un ID/key ajeno resuelve la propiedad real contra Firestore, no confía en el dato que llega (con la única excepción encontrada y ya corregida: `generarReporteCliente`).
3. Las Firestore Rules derivan la identidad del caller de su propio documento `portalUsers`, nunca de lo que pida la consulta — cierra IDOR y escalada de privilegios en la misma pieza.
4. PITR + Papelera de R2 con retención acotada dan una red de recuperación real ante un incidente, sin necesitar borrado permanente inmediato en ningún flujo normal.
5. La suite de tests (whitebox + contra el emulador real de Firestore) convierte cada hallazgo de esta auditoría en una regresión permanente — un futuro cambio que reintroduzca cualquiera de estos bugs rompe CI antes de llegar a producción.

## ¿Qué riesgo residual queda?

Ventana angosta de sesión válida en Cloud Functions individuales tras archivar una cuenta (documentada, no cerrada del todo). App Check no activado (documentado, migración diseñada pero no ejecutada). CSP/HSTS no configurados (deliberadamente diferido, requiere su propio proyecto de verificación). Configuración de cuenta de Cloudflare R2 (público/privado, CORS) no verificable desde el código. Ninguno de estos cuatro puntos es, hoy, una vulnerabilidad crítica o alta explotable de forma directa — son hardening pendiente, no compromiso conocido.

---

## Evidencia de despliegue

Commit `42bb8ad` (main), GitHub Actions run `31543080737` (`setup-r2-secrets-and-deploy.yml`, `desplegar_reglas: true`), conclusión `success`. Confirmado directamente en el log del job:

- `Reglas publicadas y verificadas.` (paso "Verificar que las reglas publicadas son las del repositorio") — la corrección de `esCuentaDePortal()` está en producción, no solo en el repositorio.
- `functions[generarReporteCliente(us-central1)] Successful update operation.`
- `functions[administrarUsuarioPortal(us-central1)] Successful update operation.`
- `functions[listarReportesCliente(us-central1)] Successful update operation.`
- `functions[firmarUrlsR2(us-central1)] Successful update operation.`
- `functions[resumenOcupacion(us-central1)] Successful update operation.`
- `functions[restablecerPasswordCliente(us-central1)] Successful update operation.`
- `functions[enviarCorreoConPdf(us-central1)] Successful update operation.`

Antes del despliegue: suite completa 1084/1084 tests, suite de reglas contra el emulador real 82/82, `tsc --noEmit` limpio en raíz y en `functions/`, `npm run build` limpio.

## Veredicto

🟡 **GO CON PENDIENTES** — no queda ninguna vulnerabilidad crítica o alta conocida después de las pruebas y correcciones de esta revisión (el único hallazgo P0 real, borrado no autenticado de archivos en `generarReporteCliente`, está corregido, probado con mutación y desplegado). Queda hardening relevante pero no bloqueante: App Check, CSP/HSTS, y la confirmación manual de la configuración de cuenta de Cloudflare R2.
