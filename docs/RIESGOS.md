# Riesgos técnicos pendientes — Vista360 Player

Última revisión: **5 de agosto de 2026**

Este documento es el resultado de una auditoría de endurecimiento. Lista lo que
**sigue siendo un riesgo**, no lo ya corregido. Está ordenado por prioridad real
(impacto × probabilidad), no por facilidad.

Convención: **Ahora** = conviene hacerlo antes de crecer. **Cuando duela** = hay
que vigilarlo, pero corregirlo hoy sería trabajo prematuro. **Vigilar** = no
requiere acción, solo no perderlo de vista.

---

## 1. No hay alertas cuando algo falla en producción

| | |
|---|---|
| **Riesgo** | 🔴 Alto |
| **Impacto** | Alto — un error que afecta a un cliente puede pasar días sin que nadie se entere |
| **Probabilidad** | Alta — ya pasó varias veces |
| **Cuándo** | **Ahora** |

Hoy la única forma de enterarse de que algo falla es que un cliente avise. Todos
los bugs de pines de esta semana se descubrieron así. El `ErrorBoundary` muestra
una pantalla decente al usuario, pero **no reporta nada a ningún lado**: nadie
sabe cuántas veces se ha mostrado, ni a quién, ni por qué.

**Recomendación:** conectar un servicio de reporte de errores (Sentry tiene plan
gratuito suficiente para este volumen). Enviar desde `ErrorBoundary`, desde el
`catch` de las llamadas al backend, y desde el handler global de `main.tsx`. Es
la mejora con mejor relación esfuerzo/beneficio que queda.

---

## 2. Sin timeout propio en las llamadas al backend

| | |
|---|---|
| **Riesgo** | 🟠 Medio-alto |
| **Impacto** | Medio — botón congelado hasta 70s; el usuario asume que se rompió y cierra la app |
| **Probabilidad** | Alta en móvil con mala señal |
| **Cuándo** | **Ahora**, pero con cuidado |

Ninguna llamada define un timeout, así que rige el de Firebase (70s). En un
celular con señal intermitente, "Creando campaña…" puede quedarse casi un minuto
sin decir nada, y el usuario cierra la app — cuando la operación quizá sí se
completó en el servidor.

**Ojo:** un timeout global sería un error. `generarReporteCliente` tarda
legítimamente hasta 540s. Hay que ponerlo **por función**: corto (~20s) en las
acciones interactivas (crear/editar/eliminar), largo o ninguno en generación de
reportes y compresión de PDF.

---

## 3. Las listas se traen completas, sin paginación

| | |
|---|---|
| **Riesgo** | 🟠 Medio |
| **Impacto** | Alto cuando llegue — pantallas lentas y factura de Firestore creciente |
| **Probabilidad** | Segura a largo plazo, lejana hoy |
| **Cuándo** | **Cuando duela** (umbral concreto abajo) |

`useContratos`, `useFacturas`, `usePanelesDisponibles` y `useNotificaciones`
traen la colección entera (filtrada por cliente, salvo paneles que es global).
Con el volumen actual es instantáneo. Paginar hoy sería trabajo prematuro y
añadiría complejidad sin beneficio.

**Umbral para actuar:** cuando un solo cliente pase de ~300 campañas o el
inventario supere ~200 paneles. Ahí conviene paginar o acotar por fecha
(ej. traer solo lo de los últimos 2 años y cargar el resto bajo demanda).

**Ya corregido esta semana:** la lectura equivalente en el backend.
`crearContrato`/`actualizarContrato` leían *todos* los contratos existentes en
cada operación — el caso grave, porque crecía con el negocio entero y no por
cliente. Ahora se filtra por panel **y por fecha** (`fin >= inicio`) en la propia
consulta: un contrato que terminó antes de que empiece la campaña nueva no puede
chocar, así que ni se trae. Se leen solo los contratos vigentes o futuros de esos
paneles — un puñado, sin importar los años de historial.

---

## 4. Las reglas de seguridad de Firestore no están en el repositorio

| | |
|---|---|
| **Riesgo** | 🟠 Medio |
| **Impacto** | Alto si se pierden o alguien las cambia por error |
| **Probabilidad** | Baja pero permanente |
| **Cuándo** | **Ahora** (es rápido) |

Las reglas viven solo en la consola de Firebase. No hay historial de cambios, ni
revisión, ni forma de saber cuándo se modificaron ni por qué. Si alguien las
afloja por accidente, nada lo detecta.

(Los **índices** sí quedaron versionados en `firestore.indexes.json` y se
despliegan solos, antes que las funciones. Falta hacer lo mismo con las reglas.)

**Recomendación:** exportarlas a `firestore.rules` y versionarlas. Son la última
línea de defensa de los datos: el frontend ya no escribe directo (todo pasa por
Cloud Functions), pero las reglas son lo que impide que alguien con una sesión
válida lea datos de otro cliente saltándose la app.

---

## 5. Vulnerabilidades heredadas del SDK de Firebase

| | |
|---|---|
| **Riesgo** | 🟡 Bajo-medio |
| **Impacto** | Bajo hoy — no llega al navegador del cliente |
| **Probabilidad** | Media a futuro |
| **Cuándo** | **Cuando duela** |

Las 10 vulnerabilidades que reporta `npm audit` vienen todas de `undici`, que
entra por el SDK de Firebase v10. `undici` es un cliente HTTP de Node: **no viaja
al bundle del navegador**, así que el riesgo real en la app publicada es
prácticamente nulo hoy.

**Recomendación:** subir Firebase a v11+ en una sesión dedicada, con el CI
vigilando y probando login, campañas y subida de archivos. Es un salto de versión
mayor: hacerlo apurado es más peligroso que la vulnerabilidad.

---

## 6. React 18 mientras el ecosistema avanza a 19+

| | |
|---|---|
| **Riesgo** | 🟡 Bajo |
| **Impacto** | Medio a 3-5 años — librerías nuevas dejarán de soportar 18 |
| **Probabilidad** | Segura, pero lenta |
| **Cuándo** | **Vigilar** |

Nada urge. React 18 tiene soporte largo. Pero cuanto más se tarde, más grande es
el salto. Conviene planificarlo cuando haya una ventana tranquila, no cuando una
dependencia lo obligue.

---

## 7. Sin pruebas de las pantallas completas

| | |
|---|---|
| **Riesgo** | 🟡 Bajo |
| **Impacto** | Medio — un cambio de UI puede romper un flujo sin que nada avise |
| **Probabilidad** | Media |
| **Cuándo** | **Cuando duela** |

Los 392 tests cubren muy bien la **lógica** (fechas, cupos, cruces, pines,
diálogos, seguridad del popup) pero casi nada del **render**. Un cambio que rompa
un botón o deje una pantalla en blanco compila, pasa los tests y llega a
producción.

**Recomendación:** cuando alguna pantalla vuelva a dar problemas, escribirle un
test de render antes de arreglarla — no cubrirlas todas de golpe.

---

## 8. El despliegue de Cloud Functions depende de una lista escrita a mano

| | |
|---|---|
| **Riesgo** | 🟡 Bajo (ya mitigado) |
| **Impacto** | Alto cuando pasa — la función nueva simplemente no existe en producción |
| **Probabilidad** | Baja ahora |
| **Cuándo** | **Vigilar** |

El workflow de despliegue nombra cada función una por una. Si alguien agrega una
Cloud Function y olvida añadirla a esa lista, **nunca se despliega** y no hay
ningún error: la app simplemente falla al llamarla. Ya ocurrió una vez
(`diagnosticoPanel`).

**Mitigación posible:** un paso en el CI que compare los `export` de
`functions/src/index.ts` contra la lista del workflow y falle si alguno falta.

---

## 9. Queda una escritura directa del navegador a Firestore

| | |
|---|---|
| **Riesgo** | 🟡 Bajo |
| **Impacto** | Bajo — no permite escalar privilegios |
| **Probabilidad** | Baja |
| **Cuándo** | **Cuando duela** |

`SolicitudesCampana.tsx` actualiza el estado de una solicitud con un `updateDoc`
directo, en vez de pasar por una Cloud Function como el resto. Es una pantalla
solo de administradores y escribe en `solicitudesCampana`, una colección donde
**no** vive el campo `role`, así que no abre ninguna vía de escalada de
privilegios. Pero obliga a mantener una regla de Firestore que permita esa
escritura desde el cliente.

**Ya corregido lo grave de esta familia:** el registro de accesos y visitas
escribía directo sobre `portalUsers/{uid}`, que es justo donde vive `role`. Si la
regla que lo permitía no acotaba los campos exactos, cualquiera podía escribirse
`role: "admin"`. Ahora pasa por Cloud Function y las reglas pueden prohibir del
todo que el cliente escriba en `portalUsers`.

---

## Cómo quedó lo revisado

Sin hallazgos pendientes en: fugas de memoria (listeners y timers se limpian
bien), manejo de fechas (usa mediodía para evitar desfases de zona horaria),
inyección de HTML (única superficie cubierta y con tests), credenciales en el
repositorio (ninguna), doble envío en formularios (protegido), errores tragados
en silencio (ninguno) y código muerto (eliminado).
