# Playbook de respuesta a incidentes — cuenta interna comprometida

Escenario: mañana roban (phishing, malware, contraseña reutilizada filtrada en otro sitio) la cuenta de un Gerente o Trabajador de Vista360 Player.

## Qué puede destruir un atacante con esa cuenta

Con una cuenta **Gerente** (rol `admin`): puede archivar o eliminar cualquier cliente y todo lo que cuelga de él (contratos, facturas, accesos), eliminar paneles, eliminar solicitudes, archivar o eliminar cuentas de otro personal interno (incluida potencialmente otra cuenta Gerente), restablecer la contraseña de cualquier cliente, restaurar cualquier archivo de la papelera de R2, y enviar correo con adjuntos a cualquier destinatario. No puede escribirse a sí mismo campos privilegiados nuevos (`firestore.rules` cierra por completo la escritura del navegador a `portalUsers`), ni leer/escribir nada fuera de lo que las Cloud Functions ya exponen a un rol admin.

Con una cuenta **Trabajador**: puede crear/editar paneles y contratos (quedan en cola de aprobación del Gerente, no se ejecutan directo salvo la creación), no puede eliminar paneles ni facturas, no puede usar la Papelera (el rol Trabajador está explícitamente excluido, solo Gerente), no puede administrar otras cuentas de personal directamente (solo puede *solicitar* la eliminación, que un Gerente debe aprobar).

En ambos casos, la acción más dañina realista es el borrado de datos (contratos, clientes, paneles) — no hay forma de exfiltrar TODO en una sola llamada (no existe una Function que descargue la base completa), pero sí de leer cualquier cliente uno por uno.

## Qué recupera cada mecanismo

- **PITR (Point-in-Time Recovery) de Firestore** — activo en este proyecto (verificado en una revisión anterior). Cubre cualquier documento de Firestore borrado o modificado: clientes, contratos, facturas, paneles, portalUsers, agregados. Ventana de recuperación típica de Firestore PITR: 7 días. Restaura el estado de la base a un instante exacto, no selectivamente — es la herramienta para "deshacer todo lo que pasó entre las X:XX y las X:XX", no para deshacer una sola acción sin tocar las demás.
- **Papelera de R2** (`_papelera/`, este proyecto) — cubre archivos (facturas, avatares, fotos de campaña) borrados a través de las Cloud Functions que ya usan `borrarObjetoR2` (eliminación de factura, reemplazo de avatar/foto, `generarReporteCliente` limpiando fotos temporales). Ventana: 30 días (regla de ciclo de vida de Cloudflare), después de la cual Cloudflare los purga automáticamente y ya no hay vuelta atrás. Restauración exclusiva del Gerente, vía la pantalla Papelera.
- **Lo que NINGUNO de los dos recupera**: acciones que no sean "borrar/modificar un documento o archivo" — por ejemplo, un correo ya enviado a un destinatario (`enviarCorreoConPdf`), una contraseña de cliente ya cambiada (la contraseña VIEJA no se puede recuperar — hay que generar una nueva), o el hecho de que un atacante haya LEÍDO datos antes de que se le cortara el acceso (ninguna herramienta de recuperación puede deshacer una lectura).

## Cómo cortar el acceso — AHORA, en producción

1. **Archivar la cuenta desde Vista360 Player** (Centro de gestión → Usuarios → [cuenta] → Archivar), solo puede hacerlo otro Gerente. Esto, desde esta revisión, hace TRES cosas en la misma llamada (`administrarUsuarioPortal.ts`):
   - `disabled: true` en Firebase Auth (bloquea inicios de sesión y renovaciones nuevas).
   - `revokeRefreshTokens(uid)` (corta cualquier renovación de token en curso).
   - Marca `archived: true` en `portalUsers/{uid}`, y **Firestore Rules ahora comprueban ese campo en cada lectura** (`esCuentaDePortal()`) — un token todavía válido (hasta ~1 hora, por cómo funciona la revocación de Firebase) deja de poder leer Firestore de inmediato, sin esperar a que expire.
   - **Limitación conocida y documentada**: esa misma comprobación de `archived` NO está replicada dentro de cada Cloud Function individualmente (serían decenas de archivos) — así que, en teoría, un token todavía válido podría seguir llamando alguna Cloud Function hasta su expiración natural. Es una ventana angosta (minutos, no hasta 1 hora completa en la práctica, porque el SDK de Firebase intenta renovar el token periódicamente y esa renovación fallará en cuanto se revocó), pero no es cero. Ver "Próximo paso recomendado" abajo.

2. Si no se puede entrar a Vista360 Player (la propia cuenta del respondedor también está comprometida, o no hay otro Gerente disponible), hacerlo directo desde la **consola de Firebase → Authentication**: deshabilitar el usuario ahí mismo tiene el mismo efecto de bloqueo de login/renovación, aunque no marca `archived` en Firestore (para eso hace falta editar el documento `portalUsers/{uid}` a mano desde la consola de Firestore, agregando `archived: true`).

3. **Rotar credenciales** que esa persona pudiera conocer y que Vista360 comparte entre varias personas: si tenía acceso a los secrets de GitHub Actions (poco común, solo quien administra el repo), rotar `FIREBASE_SERVICE_ACCOUNT`, `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, `RESEND_API_KEY`, `CRON_SYNC_SECRET` desde sus respectivos paneles (Google Cloud IAM, Cloudflare R2 tokens, Resend, y el propio valor del secret de cron). Esto es aparte de archivar la cuenta de la app — son sistemas distintos.

## Después de cortar el acceso

4. Revisar los logs de auditoría (`auditar()` — Cloud Logging) filtrando por el `uid` de la cuenta comprometida, para reconstruir qué hizo mientras tuvo acceso: `panel_eliminado`, `usuario_eliminado`, `password_restablecida`, `archivo_restaurado_papelera`, etc. quedan todos registrados con uid, acción, objetivo y momento.
5. Si hubo borrados: usar PITR para restaurar Firestore al instante justo ANTES de la primera acción sospechosa (esto revierte TODO lo que pasó desde ese instante, incluidas acciones legítimas de otras personas en el medio — sopesarlo). Si hubo borrados de archivos aislados, restaurarlos individualmente desde la Papelera en vez de tocar Firestore.
6. Crear una cuenta nueva para la persona (no reutilizar la vieja) una vez que se confirme que el incidente terminó, y forzar cambio de contraseña en el primer login.

## Próximo paso recomendado (no implementado en esta revisión)

Extender la comprobación de `archived` a las Cloud Functions individuales (hoy cada una relee `portalUsers/{uid}` en vivo para el rol, pero no todas comprueban `archived`) cerraría por completo la ventana residual descrita en el punto 1. No se hizo en esta pasada porque tocar la lógica de autenticación de docenas de archivos de una sola vez es un cambio grande y arriesgado para el beneficio adicional (la ventana ya es de minutos, no de una hora completa, gracias a la revocación del refresh token) — encaja mejor como una tarea aparte, con su propio ciclo de prueba, no como parte de esta auditoría.
