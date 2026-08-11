# Vista360 Player — Operación en producción

Última revisión: **11 de agosto de 2026**

Este documento es el punto de partida para operar la aplicación ya lanzada:
qué es, cómo se despliega, dónde se ve si algo falla, y qué hacer si algo se
rompe. No repite el detalle de cada tema -- para eso están los documentos
enlazados en cada sección. Esto es el mapa, no el territorio.

---

## 1. Arquitectura, en un párrafo

Frontend: React + Vite, en Cloudflare Pages, dominio `vista360player.pe`. Sin
enrutado por URL (SPA de estado interno). Backend: Firebase -- Firestore
(base de datos), Cloud Functions v2 (~63 funciones, toda la lógica sensible
pasa por acá, el frontend no escribe directo salvo lo que las Reglas
permiten explícitamente), Auth, y Cloudflare R2 para archivos (PDFs, fotos,
avatares) vía URLs firmadas con expiración. Proyecto de Google Cloud:
`base-de-datos-vista360`. Repositorio: `armn11155-ctrl/Vista360-Player`,
rama `main`.

---

## 2. Cómo desplegar

**Frontend:** automático. Cualquier push a `main` que pase el build de
Cloudflare Pages queda publicado. No requiere acción manual.

**Backend (Cloud Functions, índices, y opcionalmente Reglas):** manual,
siempre. Workflow de GitHub Actions **"🔑 Configurar Secrets de R2 y
Desplegar Functions"**, disparado a mano (`workflow_dispatch`) desde la
pestaña Actions del repo. Tiene una casilla `desplegar_reglas` (**apagada
por defecto**): solo hay que marcarla si el cambio toca `firestore.rules`.

**Regla práctica:** si un cambio toca `functions/src/`, `firestore.rules` o
`firestore.indexes.json`, el push a `main` NO es suficiente -- hay que
lanzar el workflow de arriba después. El propio CI ahora recuerda esto solo
(ver sección 4), pero no lo dispara automáticamente: sigue siendo una acción
humana a propósito, para no desplegar Cloud Functions sin querer en cada
push.

---

## 3. Cómo verificar que un despliegue salió bien

1. **CI en verde** (workflow "✅ Verificar", corre solo en cada push/PR):
   tipos del frontend, tests (900+), build de producción, tipos del
   backend, y la suite de ataques contra Reglas de Firestore (emulador). Si
   algo de esto está rojo, no se debería haber llegado a producción.
2. Si el push tocaba backend: revisar que el workflow de despliegue
   terminó en verde en la pestaña Actions, y que el paso "Verificar que los
   índices del repositorio están vivos" no falló.
3. **Smoke test manual mínimo** (2 minutos): entrar como Gerente, abrir una
   campaña; entrar como Cliente, abrir Reportes y Facturas. Si algo de esto
   se rompe, revertir el commit antes de investigar con calma.

---

## 4. Dónde mirar cuando algo falla

| Qué | Dónde | Detalle |
|---|---|---|
| Errores de Cloud Functions | Cloud Logging / Error Reporting (proyecto `base-de-datos-vista360`) | Se captura solo, sin instrumentar nada. Notifica por correo desde el 11-ago-2026 (ver `OBSERVABILIDAD.md`). |
| Ejecuciones fallidas repetidas de cualquier función | Alerta `VISTA360 - Errores repetidos en Cloud Functions` | Correo si 3+ ejecuciones con `status != ok` en 5 min. |
| Frontend/sitio caído | Alerta `VISTA360 - Frontend/sitio caido` | Chequeo cada 5 min sobre `vista360player.pe`; avisa si falla 1 min seguido. |
| Acciones destructivas (quién borró/cambió qué) | Cloud Logging, filtrar `jsonPayload.evento` | Cubre contratos, clientes, paneles, usuarios, contraseñas y facturas -- ver `OBSERVABILIDAD.md`. |
| Gasto de Google Cloud | Facturación → Informes / Presupuestos y alertas | Presupuesto `VISTA360 - Alerta gasto real`, USD 30/mes, avisa al 50/90/100%. |
| Fallos de CI/build | Pestaña Actions del repo | Cada job deja su log; el de reglas deja el resultado de los 63 ataques. |
| Errores del navegador del cliente (JS roto en un móvil concreto) | **No hay, hoy** | El `ErrorBoundary` los muestra al usuario pero no los reporta a ningún lado. Pendiente una decisión sobre un servicio externo (Sentry u otro) -- ver `RIESGOS.md` #1. No se activó sin consultar: implica un tercero y (aunque el plan gratuito alcanza) una cuenta más que mantener. |
| Métricas/errores de Cloudflare Pages y R2 | Panel de Cloudflare | **No revisado en esta sesión** (sin acceso a la consola de Cloudflare desde acá). Queda como acción pendiente: confirmar si Cloudflare Pages tiene notificaciones de build fallido activadas, y si R2 tiene alguna métrica de error expuesta. |

---

## 5. Si algo se rompe de verdad

- **Credencial perdida** (secreto de GitHub, clave de servicio, API key):
  `RECUPERACION.md`.
- **Dato borrado o corrompido por accidente** (Firestore, Auth, R2):
  `RECUPERACION-DE-DATOS.md`.
- **Reglas de Firestore mal desplegadas**: están versionadas en
  `firestore.rules`; revertir el commit y volver a desplegar con
  `desplegar_reglas` marcado.
- **Duda sobre si algo es un ataque o un bug**: la suite de Reglas
  (`npm run test:reglas`) y los tests de aislamiento entre clientes ya
  cubren los vectores conocidos -- si el síntoma no está ahí, es nuevo y
  merece investigarse antes de asumir cualquiera de las dos cosas.

---

## 6. Qué NO tocar sin una razón concreta

Estas áreas ya pasaron por auditorías dedicadas (aislamiento entre
clientes, permisos del Trabajador, Reglas de Firestore, índices,
analítica, optimización de lecturas, PWA/R2). **No reabrir ni "mejorar" sin
una regresión real y concreta que lo justifique** -- son las partes del
sistema donde un cambio "de paso" tiene más probabilidad de introducir un
agujero de seguridad que de arreglar algo.

---

## 7. Bombas de tiempo conocidas y su umbral

Detalle completo en `OBSERVABILIDAD.md` (parte 2) y `RIESGOS.md`. Resumen
de lo que de verdad conviene vigilar:

| Qué | Umbral | Qué pasa si se cruza |
|---|---|---|
| Documentos "resumen"/agregado por cliente o panel (`agregadoCliente`, `agregadoPaneles`, `resumenOcupacion`) | Firestore corta documentos en 1 MB | Hoy sin datos que crezcan sin control (revisado en `OBSERVABILIDAD.md`), pero son los primeros candidatos si el negocio crece mucho en clientes/campañas simultáneas. No hay alarma automática de tamaño -- si se sospecha, revisar el tamaño del documento a mano en la consola de Firestore. |
| Listas del frontend sin paginación | ~300 campañas por cliente / ~200 paneles | La pantalla se vuelve lenta antes de romperse. Ver `RIESGOS.md` #3. |
| Listener global de paneles (`usePanelesDisponibles`) | Varios cientos de paneles con muchos usuarios simultáneos | Costo de lecturas crece con paneles × sesiones abiertas. |
| Escrituras por lote (`batch()`, límite duro 500) | `administrarClienteAdmin` ya trocea a 450; el resto opera sobre un puñado de filas | Sin riesgo real hoy. |
| Vulnerabilidad moderada de `uuid` (transitiva, dentro de `firebase-admin`) | N/A -- no hay dato propio expuesto | Ver sección 8. Vigilar, no urge. |

---

## 8. Dependencias: qué mirar y cuándo

Revisado el 11 de agosto de 2026 (`npm audit`, versiones de Node/SDKs,
versiones de GitHub Actions):

| Clasificación | Qué |
|---|---|
| **AHORA** | Nada. No hay una vulnerabilidad explotable ni una versión a punto de perder soporte. |
| **PRÓXIMOS MESES** | `uuid` moderado (GHSA-w5hq-g745-h8pq), transitivo de `firebase-admin`/`@google-cloud/storage` en `functions/`. `npm audit fix --force` bajaría `firebase-admin` a la v10 (rotura mayor) -- no vale la pena por esta vulnerabilidad puntual. Se resuelve solo cuando Google actualice esa dependencia interna; revisar cada tanto con `npm audit` en `functions/`. React 18 (sin problema hoy, pero el ecosistema avanza a 19+ -- ver `RIESGOS.md` #6). |
| **NO TOCAR** | Todo lo demás está al día: Node 22 (consistente entre `.node-version`, `functions/package.json` y los workflows), `firebase` 12.x / `firebase-admin` 14.x / `firebase-functions` 7.x (API v2 completa, sin rastros de v1), GitHub Actions en v5 (checkout, setup-node, setup-java, upload-artifact), 0 vulnerabilidades en el frontend. |

---

## 9. Qué está automatizado en el release y qué sigue siendo manual

**Automatizado (CI, en cada push/PR):** tipos del frontend y del backend,
942 tests, build de producción replicando el entorno real de Cloudflare
(sin `functions/node_modules`), y 63 pruebas de ataque contra las Reglas de
Firestore en un emulador real. Desde el 11-ago-2026, además: un aviso
automático (no bloqueante) cuando un push toca backend/reglas/índices, para
que sea imposible olvidar el paso manual de la sección 2.

**Todavía manual, a propósito:** decidir CUÁNDO desplegar Cloud Functions
(no en cada push, para no desplegar 63 funciones por cada cambio de
frontend) y decidir cuándo republicar Reglas (para que un cambio accidental
en `firestore.rules` no llegue a producción sin que alguien lo revise). Son
decisiones deliberadas, documentadas en los comentarios del propio
workflow -- no un descuido a corregir.

**No automatizado y sin plan de automatizar (evaluado y descartado por
ahora):** pruebas end-to-end de pantallas completas (`RIESGOS.md` #7) --
tiene valor, pero es trabajo nuevo no trivial, no una casilla que falte
marcar.

---

## 10. Checklist antes/después de un release

**Antes de mezclar a `main`:**
- [ ] CI en verde (tipos, tests, build, reglas).
- [ ] Si toca Firestore Rules: revisado a mano el diff de `firestore.rules`,
      no solo confiar en que pasó el emulador.
- [ ] Si toca una Cloud Function ya cubierta por un test whitebox
      (`src/logica-negocio/*.test.ts`): el test actualizado y probado por
      mutación (romper el fix, confirmar que el test falla, restaurar).

**Después de mezclar:**
- [ ] Revisar el resumen del job "🔔 Recordatorio de despliegue manual" --
      si dice que el push tocó backend/reglas/índices, lanzar el workflow
      de despliegue.
- [ ] Si se marcó `desplegar_reglas`: confirmar en el log del workflow que
      el paso de verificación post-despliegue coincide con el repo.
- [ ] Smoke test manual (sección 3).

---

## 11. Calendario de mantenimiento sugerido

No son tareas automáticas -- son recordatorios de qué revisar y cada
cuánto, para no depender de acordarse.

| Cada | Qué revisar |
|---|---|
| **1 mes** | Presupuesto de facturación vs. gasto real (¿el umbral de USD 30 sigue siendo realista?). Alertas: ¿llegó algún correo, hizo ruido o quedó en silencio? |
| **3 meses** | `npm audit` en raíz y en `functions/` (dependencias nuevas). Tamaño real de los documentos "resumen"/agregado si el número de clientes o campañas activas creció notablemente. |
| **6 meses** | Releer `RIESGOS.md` y `OBSERVABILIDAD.md` completos -- ¿algo marcado "vigilar" ya cruzó su umbral? Confirmar que PITR sigue activo (no debería desactivarse solo, pero es gratis confirmarlo). Revisar si sigue habiendo un solo propietario de las cuentas de Google/GitHub/Cloudflare (`RECUPERACION.md`, sección final). |
| **12 meses** | Evaluar si sigue teniendo sentido no tener reporte de errores del frontend (Sentry u otro) a la luz del volumen real de usuarios. Evaluar el salto de React 18 a una versión mayor si el ecosistema ya lo está empujando. Confirmar el versionado del bucket R2 (sección de `RECUPERACION-DE-DATOS.md`) si no se hizo antes. |

---

## 12. Documentos relacionados

- `RIESGOS.md` -- auditoría de riesgos técnicos, con prioridad e impacto.
- `OBSERVABILIDAD.md` -- detalle de qué se puede ver hoy y qué falta, y las
  bombas de tiempo revisadas una a una.
- `RECUPERACION.md` -- qué hacer si se pierde una credencial.
- `RECUPERACION-DE-DATOS.md` -- qué hacer si se borra o corrompe un dato
  real.
- `REGLAS-SEGURIDAD.md` -- cómo están estructuradas las Reglas de
  Firestore.
