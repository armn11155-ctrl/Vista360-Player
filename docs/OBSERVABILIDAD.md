# Observabilidad y bombas de tiempo

Última revisión: **5 de agosto de 2026**

Complementa `RIESGOS.md`. Acá va (1) qué capacidades de operación tiene y le faltan
al sistema, y (2) las decisiones técnicas que hoy funcionan bien pero podrían
convertirse en un problema al crecer.

---

## Parte 1 — Observabilidad

### Lo que ya hay

| Capacidad | Estado | Detalle |
|---|---|---|
| Auditoría de acciones destructivas | ✅ Implementado | Quién borró una campaña, un panel o un cliente, y cuándo. Antes se perdía por completo. |
| Logging estructurado | ✅ Implementado | `functions/src/registro.ts`. Campos consultables en Cloud Logging, no texto suelto. |
| Recuperación ante errores de UI | ✅ | `ErrorBoundary` muestra una pantalla propia en vez de dejarla en blanco. |
| Recuperación ante versión desactualizada | ✅ | Recarga sola al detectar código viejo tras un despliegue. |
| Degradación ante fallo de índice | ✅ | La consulta de cruces se rehace sin filtro en vez de romperse. |
| Verificación previa al despliegue | ✅ | CI en cada push, en entorno limpio. |
| Diagnóstico del despliegue | ✅ | Los logs quedan como artefacto de cada ejecución. |
| Backups de datos | ✅ (de Firebase) | Firestore hace copias automáticas gestionadas por Google. |

### Lo que falta, por orden de valor

#### 1. Alertas automáticas — 🔴 lo más importante

Hoy, si `crearContrato` empieza a fallar, nadie se entera hasta que alguien
llama. El logging estructurado que se acaba de añadir es justamente lo que hacía
falta para poder montar alertas: ahora los eventos se pueden filtrar por campo.

**Cómo activarlo** (gratis, en el proyecto de Google Cloud que ya se paga, sin
tocar código): Cloud Logging → *Crear métrica basada en logs* con el filtro

```
jsonPayload.resultado="error"
```

y encima una alerta que avise por correo si supera N en 10 minutos. Toma unos
minutos y no requiere ningún servicio nuevo.

#### 2. Reporte de errores del frontend — 🟠 alto valor, decisión pendiente

Las alertas anteriores cubren el **backend**. Los errores del **navegador**
(pantalla rota, fallo de JavaScript en un móvil concreto) siguen invisibles: el
`ErrorBoundary` los muestra pero no los reporta a ningún lado.

Cubrirlo requiere un servicio externo. **Sentry** tiene un plan gratuito que
sobra para este volumen. Es la única recomendación de esta lista que implica
depender de un tercero, y por eso no se implementó sin consultar:

- **A favor:** es la causa raíz de que todos los fallos de esta semana los
  descubriera el cliente y no el equipo. Da el error exacto, el navegador, y
  hasta los pasos previos.
- **En contra:** una dependencia más, una cuenta más, y el envío de datos de
  diagnóstico a un tercero (configurable para no mandar datos personales).

#### 3. Métricas de negocio — 🟡 más adelante

Cuántas campañas se crean por semana, cuántas fallan por cruce de fechas, qué
paneles se piden más. Hoy solo se puede saber consultando la base a mano. Con las
métricas basadas en logs del punto 1 sale casi gratis, pero no urge.

---

## Parte 2 — Bombas de tiempo

Revisadas una a una contra el código, con su límite real.

### Ya desactivadas

| Qué era | Por qué habría explotado | Estado |
|---|---|---|
| Lectura de todos los contratos al crear/editar campaña | Crecía con el negocio entero, dentro de una transacción | ✅ Filtrado por panel y fecha |
| Índices sin versionar | Se perdían o se cambiaban sin rastro | ✅ En `firestore.indexes.json` |
| Despliegue con `--force` en índices | Habría borrado índices existentes | ✅ Quitado + test que lo impide |
| Diagnóstico por push de rama | Fallaba siempre que se tocara un workflow | ✅ Ahora es un artefacto |
| Acciones de GitHub en Node 20 | Dejarían de arrancar al retirarlo | ✅ Actualizadas a v5 |

### Vigiladas, con su umbral

**Escrituras por lote (límite duro: 500).** Revisados los 7 usos de `batch()`.
`administrarClienteAdmin` es el único que puede crecer sin techo y **ya trocea
a 450**. El resto opera sobre usuarios de un solo cliente (un puñado). Sin riesgo
real; el umbral sería un cliente con cientos de usuarios de portal.

**Herramientas de mantenimiento que leen colecciones enteras.**
`limpiarArchivosHuerfanos` lee 6 colecciones completas y `contarEvidenciasHuerfanas`
todos los contratos. Es inherente a su función (buscan huérfanos: hay que mirarlo
todo) y las lanza el admin a mano, no un cliente. **Umbral:** si algún día se
acercan a su tiempo máximo, habrá que trocearlas por fechas. Hoy no.

**Listas del frontend sin paginación.** Ver `RIESGOS.md` punto 3. Umbral: ~300
campañas por cliente o ~200 paneles.

**Listener global de paneles.** `usePanelesDisponibles` mantiene una escucha en
vivo sobre *todo* el inventario, por cada sesión abierta. El coste crece con
paneles × usuarios conectados. Con decenas de paneles es irrelevante. **Umbral:**
varios cientos de paneles con muchos usuarios simultáneos; ahí convendría acotar
por ciudad o cargar bajo demanda.

**Vulnerabilidades heredadas de Firebase v10.** Ver `RIESGOS.md` punto 5.

**Punto único de fallo: la cuenta de servicio del despliegue.** Todo el
despliegue depende de un único secreto de GitHub. Si caduca o se revoca, no se
puede desplegar nada. No es urgente, pero conviene saber quién puede regenerarlo.

### Revisado y descartado

- **Límite de 1 MB por documento:** ningún campo crece sin control. Los tokens de
  notificaciones se limpian solos al detectarse inválidos.
- **Límite de 30 elementos en consultas por lote:** las consultas van de panel en
  panel, no en bloque, así que no se puede alcanzar.
- **Fugas de memoria:** todas las escuchas y temporizadores se limpian.
- **Colisión de identificadores:** los genera Firestore, no el código.
