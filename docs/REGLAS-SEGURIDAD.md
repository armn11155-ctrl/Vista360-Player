# Reglas de seguridad de Firestore — cómo publicarlas sin romper nada

Última revisión: **5 de agosto de 2026**

> ## ⚠️ Léelo antes de publicarlas la primera vez
>
> Las reglas del repositorio (`firestore.rules`) **están escritas pero NUNCA se
> han probado contra el proyecto real.** Se dedujeron leyendo el código, no
> copiando las que hay hoy en producción — que no estaban versionadas y no se
> pueden consultar desde fuera.
>
> Publicarlas sin comprobarlas puede dejar a **todos los clientes sin ver sus
> datos, al instante**. Las reglas son de todo o nada y tienen efecto inmediato:
> nadie necesita recargar nada para que les afecte.
>
> Por eso **no se publican solas**. El workflow de despliegue trae una casilla,
> apagada por defecto, y el resto del despliegue funciona igual sin marcarla.

---

## Por qué existen

Son la última línea de defensa. No dependen de que la app se comporte bien:
cualquiera puede abrir la consola del navegador y llamar a Firestore con su
sesión, saltándose la interfaz por completo. **Lo que permitan las reglas es lo
que de verdad se puede hacer.**

Hasta ahora vivían solo en la consola de Firebase: sin historial, sin revisión y
sin forma de saber cuándo cambiaron ni por qué. Ahora están en el repositorio,
junto al código que protegen.

## Qué permiten

Derivadas del uso real del código (7 colecciones que el navegador lee, 1 en la
que escribe):

| Colección | Lectura | Escritura |
|---|---|---|
| `portalUsers` | La propia; el personal interno, todas | **Prohibida** — acá vive `role` |
| `clientes` | La propia ficha; interno, todas | Prohibida |
| `contratos` | Solo los del propio cliente | Prohibida |
| `facturas` | Solo las del propio cliente | Prohibida |
| `paneles` | Cualquiera con sesión (inventario, sin datos sensibles) | Prohibida |
| `solicitudesCampana` | Las propias; interno, todas | Solo interno, y **solo** los campos de estado |
| `invitacionesPortal` | Solo personal interno | Prohibida |
| Cualquier otra | **Prohibida** | **Prohibida** |

Que casi todo esté prohibido no rompe nada: las Cloud Functions usan el Admin SDK
y **se saltan estas reglas**. Toda modificación importante ya pasa por ahí.

## Procedimiento para publicarlas la primera vez

Hazlo con tiempo, no un viernes por la tarde ni antes de una reunión.

**1. Guarda las reglas actuales.** Consola de Firebase → Firestore → Reglas.
Copia el texto completo a un archivo aparte. Es tu vuelta atrás.

**2. Compáralas con las del repositorio.** Si las de producción permiten algo que
`firestore.rules` no contempla, aparecerá acá. Presta atención a colecciones que
no estén en la tabla de arriba.

**3. Pruébalas en el simulador**, en esa misma pantalla (pestaña *Simulador de
reglas*), sin publicar nada. Como mínimo:

- Un **cliente** leyendo su propio `clientes/{su-id}` → debe permitir.
- Ese mismo cliente leyendo el `clientes/{id}` de **otro** → debe denegar.
- Un cliente leyendo un `contratos` cuyo `cliente_id` **no** es el suyo → denegar.
- Un cliente escribiendo en su propio `portalUsers` → **denegar** (esto es lo más
  importante de todo: es la vía por la que alguien podría hacerse administrador).
- Personal interno leyendo `invitacionesPortal` → permitir.

**4. Publica** lanzando el workflow *"Configurar Secrets de R2 y Desplegar
Functions"* con la casilla **"Publicar TAMBIÉN las reglas"** marcada.

**5. Comprueba en caliente, en los 5 minutos siguientes.** Entra como cliente y
revisa que se vean: Inicio, Campañas, Cobertura, Facturas y Reportes. Después
entra como admin y revisa Clientes, Accesos y Solicitudes.

**6. Si algo falla**, pega las reglas viejas del paso 1 en la consola y publica
desde ahí. Es inmediato y no depende de ningún despliegue.

## Después de la primera vez

Ya no hace falta ceremonia: marcar la casilla cuando el cambio incluya reglas.
Lo que sí conviene mantener es el paso 5 — mirar la app justo después.

## Lo que los tests sí comprueban

`src/logica-negocio/reglasFirestore.test.ts` no puede ejecutar las reglas (haría
falta el emulador y credenciales), pero sí evita que se desincronicen del código,
que es como se rompen en la práctica:

- Que toda colección que el navegador lee tenga su bloque de reglas.
- Que `portalUsers` siga con la escritura cerrada.
- Que exista el cierre por defecto, para que una colección nueva quede negada.
- Que ninguna regla quede abierta a cualquiera (`if true`).
- Que su despliegue siga sin ser automático.
