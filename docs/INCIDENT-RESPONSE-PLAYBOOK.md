# Playbook de respuesta a incidentes — cuenta interna comprometida

Escenario: mañana roban (phishing, malware, contraseña reutilizada filtrada en otro sitio) la cuenta de un Gerente o Trabajador de Vista360 Player.

## Qué puede destruir un atacante con esa cuenta

Con una cuenta **Gerente** (rol `admin`): puede archivar o eliminar cualquier cliente y todo lo que cuelga de él (contratos, facturas, accesos), eliminar paneles, eliminar solicitudes, archivar o eliminar cuentas de otro personal interno (incluida potencialmente otra cuenta Gerente), restablecer la contraseña de cualquier cliente, restaurar cualquier archivo de la papelera de R2, borrar archivos huérfanos de R2 en bloque, y enviar correo con adjuntos a cualquier destinatario. No puede escribirse a sí mismo campos privilegiados nuevos (`firestore.rules` cierra por completo la escritura del navegador a `portalUsers`), ni leer/escribir nada fuera de lo que las Cloud Functions ya exponen a un rol admin. Ver la sección "Daños posibles con una cuenta Gerente robada" más abajo para el detalle acción por acción y qué la frena.

Con una cuenta **Trabajador**: puede crear/editar paneles y contratos (quedan en cola de aprobación del Gerente, no se ejecutan directo salvo la creación), no puede eliminar paneles ni facturas, no puede usar la Papelera (el rol Trabajador está explícitamente excluido, solo Gerente), no puede administrar otras cuentas de personal directamente (solo puede *solicitar* la eliminación, que un Gerente debe aprobar).

En ambos casos, la acción más dañina realista es el borrado de datos (contratos, clientes, paneles) — no hay forma de exfiltrar TODO en una sola llamada (no existe una Function que descargue la base completa), pero sí de leer cualquier cliente uno por uno.

## Qué recupera cada mecanismo

- **PITR (Point-in-Time Recovery) de Firestore** — activo en este proyecto (verificado en una revisión anterior). Cubre cualquier documento de Firestore borrado o modificado: clientes, contratos, facturas, paneles, portalUsers, agregados. Ventana de recuperación típica de Firestore PITR: 7 días. Restaura el estado de la base a un instante exacto, no selectivamente — es la herramienta para "deshacer todo lo que pasó entre las X:XX y las X:XX", no para deshacer una sola acción sin tocar las demás.
- **Papelera de R2** (`_papelera/`, este proyecto) — cubre archivos (facturas, avatares, fotos de campaña) borrados a través de las Cloud Functions que ya usan `borrarObjetoR2` (eliminación de factura, reemplazo de avatar/foto, `generarReporteCliente` limpiando fotos temporales). Ventana: 30 días (regla de ciclo de vida de Cloudflare), después de la cual Cloudflare los purga automáticamente y ya no hay vuelta atrás. Restauración exclusiva del Gerente, vía la pantalla Papelera.
- **Lo que NINGUNO de los dos recupera**: acciones que no sean "borrar/modificar un documento o archivo" — por ejemplo, un correo ya enviado a un destinatario (`enviarCorreoConPdf`), una contraseña de cliente ya cambiada (la contraseña VIEJA no se puede recuperar — hay que generar una nueva), o el hecho de que un atacante haya LEÍDO datos antes de que se le cortara el acceso (ninguna herramienta de recuperación puede deshacer una lectura).

## Cómo cortar el acceso — AHORA, en producción

1. **Archivar la cuenta desde Vista360 Player** (Centro de gestión → Usuarios → [cuenta] → Archivar), solo puede hacerlo otro Gerente. Esto hace CUATRO cosas en la misma llamada (`administrarUsuarioPortal.ts`):
   - `disabled: true` en Firebase Auth (bloquea inicios de sesión y renovaciones nuevas).
   - `revokeRefreshTokens(uid)` (corta cualquier renovación de token en curso).
   - Marca `archived: true` en `portalUsers/{uid}`, y **Firestore Rules comprueban ese campo en cada lectura** (`esCuentaDePortal()`) — un token todavía válido deja de poder leer Firestore de inmediato, sin esperar a que expire.
   - **Cloud Functions también bloqueadas de inmediato**: toda función privada que un usuario del portal puede llamar pasa primero por `exigirCuentaActiva()` (o sus variantes `exigirGerente()` / `exigirPersonalInterno()`, definidas una sola vez en `functions/src/cuentaPortal.ts`), que relee `portalUsers/{uid}` en cada llamada — usando el Admin SDK, que ignora las Firestore Rules, así que esta comprobación es la que cierra la ventana que las Rules por sí solas no cubren. Si `archived === true`, la función devuelve `permission-denied` sin ejecutar ninguna lógica de negocio, sin importar que el ID token todavía sea válido. Esto ya no es una limitación conocida: está probado con ejecución real contra el emulador de Firestore (`src/seguridad/cuentaPortal.emulador.test.ts`) simulando exactamente este escenario — cuenta Cliente/Trabajador/Gerente archivada intentando usar un token previamente emitido — y con una prueba de caja blanca (`src/logica-negocio/mecanismoCentralizadoCuentaActiva.test.ts`) que falla en CI si alguna función privada nueva se agrega sin pasar por este mecanismo central.

   **Resultado, cuenta archivada:**
   - Firestore: BLOQUEADA ✅ (Firestore Rules, `esCuentaDePortal()`)
   - Cloud Functions: BLOQUEADAS ✅ (`cuentaPortal.ts`, comprobación `archived` en cada llamada)
   - Refresh tokens: REVOCADOS ✅ (`revokeRefreshTokens`, corta renovación de sesión)

   Las funciones que NO pasan por esta comprobación son, a propósito, las que ningún usuario del portal invoca directamente: 2 funciones `onSchedule` (cron internos de Firebase) y 1 función `onRequest` autenticada por secreto de servidor (`CRON_SYNC_SECRET`), ninguna de las cuales lee `portalUsers/`. Aplicarles esta comprobación no tendría sentido (no hay usuario archivable detrás) y las rompería.

2. Si no se puede entrar a Vista360 Player (la propia cuenta del respondedor también está comprometida, o no hay otro Gerente disponible), hacerlo directo desde la **consola de Firebase → Authentication**: deshabilitar el usuario ahí mismo tiene el mismo efecto de bloqueo de login/renovación, aunque no marca `archived` en Firestore (para eso hace falta editar el documento `portalUsers/{uid}` a mano desde la consola de Firestore, agregando `archived: true`).

3. **Rotar credenciales** que esa persona pudiera conocer y que Vista360 comparte entre varias personas: si tenía acceso a los secrets de GitHub Actions (poco común, solo quien administra el repo), rotar `FIREBASE_SERVICE_ACCOUNT`, `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, `RESEND_API_KEY`, `CRON_SYNC_SECRET` desde sus respectivos paneles (Google Cloud IAM, Cloudflare R2 tokens, Resend, y el propio valor del secret de cron). Esto es aparte de archivar la cuenta de la app — son sistemas distintos.

## Después de cortar el acceso

4. Revisar los logs de auditoría (`auditar()` — Cloud Logging) filtrando por el `uid` de la cuenta comprometida, para reconstruir qué hizo mientras tuvo acceso: `panel_eliminado`, `usuario_eliminado`, `password_restablecida`, `archivo_restaurado_papelera`, etc. quedan todos registrados con uid, acción, objetivo y momento.
5. Si hubo borrados: usar PITR para restaurar Firestore al instante justo ANTES de la primera acción sospechosa (esto revierte TODO lo que pasó desde ese instante, incluidas acciones legítimas de otras personas en el medio — sopesarlo). Si hubo borrados de archivos aislados, restaurarlos individualmente desde la Papelera en vez de tocar Firestore.
6. Crear una cuenta nueva para la persona (no reutilizar la vieja) una vez que se confirme que el incidente terminó, y forzar cambio de contraseña en el primer login.

## Daños posibles con una cuenta Gerente robada, y qué controles los reducen

Lista acción por acción de lo más destructivo que puede hacer una cuenta Gerente (`admin`) comprometida, y qué la frena hoy:

| Acción | Daño | Controles vigentes |
|---|---|---|
| Eliminar cliente (y todo lo que cuelga: contratos, facturas, accesos) | Alto — pérdida de datos de un cliente completo | `exigirGerente()` en cada llamada; auditoría (`cliente_eliminado_definitivo`); recuperable vía PITR de Firestore (ventana ~7 días) |
| Eliminar usuario interno (otro Trabajador o Gerente) | Alto — pérdida de acceso legítimo de un compañero | `exigirGerente()`; límite de ritmo `exigirRitmo(uid, "administrarUsuarioPortal", 30)` (frena un borrado masivo automatizado); auditoría (`usuario_eliminado`); la cuenta borrada se puede recrear |
| Restablecer contraseña de un cliente | Medio — bloquea al cliente legítimo hasta que se le avise la nueva contraseña | `exigirGerente()`; límite de ritmo; auditoría (`password_restablecida`); no expone la contraseña vieja pero es fácilmente reversible (generar una nueva) |
| Operaciones masivas: `administrarClienteAdmin`, `limpiarArchivosHuerfanos` (borrado en bloque de R2), `contarEvidenciasHuerfanas` | Alto si se automatiza (borrado en bloque más rápido de lo que un humano audita) | Límite de ritmo en las 5 funciones (10–30 llamadas/min según la función); `limpiarArchivosHuerfanos` ahora audita cada ejecución real (`archivos_huerfanos_borrados`) — antes de esta revisión no dejaba rastro |
| Papelera de R2 (`listarPapelera`, `restaurarDePapelera`) | Bajo/medio — restaurar de vuelta un archivo que otro Gerente había borrado a propósito | Ya exclusivo de Gerente (`exigirGerente()`); ahora también con límite de ritmo (15–20/min); auditoría (`archivo_restaurado_papelera`) |
| Enviar correo con adjuntos a cualquier destinatario | Medio — phishing o filtración usando la identidad de Vista360 | `exigirPersonalInterno()`/`exigirGerente()` según la función; no hay límite de destinatarios por llamada hoy — es el control más débil de la lista, pero el daño (un correo saliente) no es reversible por PITR de todas formas, así que un límite de ritmo por sí solo no lo resuelve del todo |

**Fricción adicional considerada y descartada por ahora** (reautenticación reciente antes de acciones destructivas, o un diálogo de doble confirmación): ninguna de las dos ataca el modelo de amenaza real de esta sección, que es una cuenta YA autenticada y con sesión activa robada (phishing, malware, token filtrado) — no alguien que llega sin sesión. Reautenticar no detiene a un atacante que ya tiene la sesión abierta en el navegador de la víctima; un diálogo de confirmación protege contra un Gerente que hace clic sin querer, no contra un atacante que hace exactamente lo que se propone hacer. Los controles que sí atacan ese modelo de amenaza — límite de ritmo (frena el daño en volumen y da tiempo a notar algo raro) y auditoría obligatoria (permite reconstruir y revertir después) — son los que se agregaron en esta revisión. Si en el futuro se agrega un panel de "sesiones activas" visible para el usuario o una alerta automática de actividad anómala, seguir cerrando la sesión (paso 1) sigue siendo el control decisivo; hasta entonces, no se justifica la fricción de UX adicional.

## Estado de este gap: cerrado en código y pruebas; verificación en producción pendiente de una cuenta de prueba

La ventana residual descrita en revisiones anteriores de este playbook (un token todavía válido podía seguir llamando Cloud Functions después de que su cuenta fuera archivada) ya no existe a nivel de código. Verificado con:

- Ejecución real contra el emulador de Firestore, simulando cuenta Cliente/Trabajador/Gerente archivada con token previamente emitido → `permission-denied` inmediato en los tres casos (`src/seguridad/cuentaPortal.emulador.test.ts`).
- Prueba de caja blanca que clasifica automáticamente cada función exportada por su tipo real de trigger (no por una lista de nombres mantenida a mano) y falla si alguna función llamable por un usuario del portal no pasa por `cuentaPortal.ts` (`src/logica-negocio/mecanismoCentralizadoCuentaActiva.test.ts`).
- Pruebas de mutación: se rompió deliberadamente la comprobación de `archived`, la llamada al helper, y la comprobación de rol en varias funciones — en cada caso, exactamente las pruebas esperadas fallaron; se restauró y se confirmó con `diff` que el código quedó idéntico al original.
- Compilación limpia (`tsc --noEmit` en `functions/` y en la raíz), suite completa (1102 pruebas) y build de producción, todos en verde.

**Falta el último paso, que requiere una cuenta real en el proyecto de Firebase de producción y no se puede automatizar desde este entorno** (no hay credenciales de una cuenta de prueba ni el service account de producción disponibles aquí): con una cuenta de prueba autorizada (nunca una cuenta real), (1) confirmar que su función legítima funciona con sesión activa, (2) archivar la cuenta, (3) reintentar la misma llamada con el token de la sesión anterior (sin volver a iniciar sesión) y confirmar `permission-denied` inmediato, (4) restaurar el estado de la cuenta de prueba. Hasta que ese paso se corra y confirme, la fila de esta tabla debe leerse como "cerrado en código, pendiente de confirmación en vivo":

**Archivar cuenta → Firestore bloqueado + Cloud Functions bloqueadas (en código y pruebas) + refresh tokens revocados.**
