# Qué hacer si se pierde un acceso

Última revisión: **5 de agosto de 2026**

Este documento existe para que, si algún día falta una credencial, no haya que
reconstruir de memoria cómo se regenera. No contiene ninguna credencial: solo el
procedimiento.

---

## Lo primero: la app NO se cae

Conviene tenerlo claro antes de entrar en pánico.

Las credenciales viven en **dos sitios distintos**, y la app en funcionamiento
solo depende de uno:

| Dónde | Para qué | Si se pierde |
|---|---|---|
| **Google Secret Manager** | Lo que usan las Cloud Functions **mientras corren** (R2, Resend, el secreto del cron) | La app deja de poder generar reportes o enviar correos |
| **Secretos de GitHub** | Solo para **desplegar** | La app sigue funcionando igual. Lo único que no se puede hacer es publicar cambios |

El despliegue copia los valores de GitHub a Secret Manager. Es decir: **perder los
secretos de GitHub no tumba nada** — bloquea publicar versiones nuevas, que es
molesto pero no urgente, y se puede resolver con calma.

---

## Los 7 secretos, y qué se rompe sin cada uno

| Secreto | Para qué | Sin él |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Desplegar Cloud Functions e índices | No se puede desplegar **nada** del backend |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Acceso al almacenamiento de PDFs | El próximo despliegue deja las funciones sin acceso a los archivos |
| `R2_ACCOUNT_ID` / `R2_BUCKET` | Identificar el almacenamiento | Igual que arriba |
| `CRON_SYNC_SECRET` | Proteger la sincronización diaria de paneles | La tarea diaria empieza a fallar con "Unauthorized" |
| `RESEND_API_KEY` | Enviar correos con los reportes | No salen los correos |

El frontend (Cloudflare Pages) no usa ninguno de estos: sus variables se
configuran aparte, en el panel de Cloudflare.

---

## Cómo regenerar cada uno

### FIREBASE_SERVICE_ACCOUNT — el más importante

Es un archivo JSON de una cuenta de servicio de Google Cloud.

> **Dato que conviene saber:** estas claves **no caducan solas**. Siguen válidas
> hasta que alguien las borra. Solo expiran si una política de organización lo
> impone, algo de empresas grandes; no aplica a este proyecto. Así que el riesgo
> no es que "se venza un día", sino que alguien la borre o se pierda el acceso a
> la cuenta de Google.

Para regenerarla:

1. Consola de Google Cloud → **IAM y administración → Cuentas de servicio**, en el
   proyecto `base-de-datos-vista360`.
2. Buscar la cuenta que usa el despliegue (o crear una nueva).
3. Pestaña **Claves → Agregar clave → Crear clave nueva → JSON**. Se descarga.
4. En GitHub: repositorio → **Settings → Secrets and variables → Actions** →
   editar `FIREBASE_SERVICE_ACCOUNT` y pegar el JSON **completo**.
5. Lanzar el workflow de despliegue para comprobar que funciona.
6. Borrar la clave vieja en Google Cloud (paso importante: si no, sigue siendo
   válida para siempre).

**Permisos que necesita esa cuenta:** desplegar Cloud Functions, escribir en
Secret Manager y crear índices de Firestore. Si al desplegar falla un paso
concreto con un error de permisos, es que le falta uno de esos roles.

### R2_* (Cloudflare)

Panel de Cloudflare → **R2 → Manage API Tokens** → crear un token nuevo con
permiso de lectura y escritura sobre el bucket. Actualizar los dos secretos en
GitHub y volver a desplegar. `R2_ACCOUNT_ID` y `R2_BUCKET` no son secretos de
verdad (son identificadores) y se ven en el propio panel.

### CRON_SYNC_SECRET

Es un valor inventado, no lo emite nadie. Basta con generar una cadena larga al
azar y ponerla en el secreto de GitHub. Al desplegar se copia sola a Secret
Manager, y ahí queda sincronizada con el workflow diario.

### RESEND_API_KEY

Panel de Resend → **API Keys** → crear una nueva, actualizar el secreto y
desplegar. Revocar la vieja después.

---

## El riesgo de fondo, dicho claro

El punto único de fallo real **no son las claves** — todas se pueden regenerar en
minutos siguiendo lo de arriba. El punto único de fallo es **el acceso a las
cuentas**:

- La cuenta de Google dueña del proyecto Firebase.
- La cuenta de GitHub dueña del repositorio.
- La cuenta de Cloudflare (Pages + R2).

Si se pierde el acceso a cualquiera de esas tres, no hay procedimiento técnico que
lo resuelva. Recomendación concreta, y no es trabajo de programación:

1. **Verificación en dos pasos activada** en las tres, con los códigos de
   respaldo guardados en un sitio seguro y fuera del ordenador de trabajo.
2. **Un segundo propietario** en cada cuenta (otra persona de confianza, o una
   segunda cuenta propia). Es lo único que protege de verdad contra perder un
   móvil o que una cuenta quede bloqueada.
3. Saber quién es hoy el propietario de cada una. Si la respuesta es "una sola
   persona", ese es el riesgo mayor del proyecto — más que cualquier cosa del
   código.

---

## Mejora futura: despliegue sin claves

Existe una forma de que GitHub se autentique con Google **sin ninguna clave
guardada**, llamada Workload Identity Federation: Google confía directamente en
GitHub para este repositorio concreto, y no hay archivo JSON que pueda perderse,
filtrarse ni borrarse.

- **A favor:** elimina la credencial de larga duración, que es la que más riesgo
  acumula con los años.
- **En contra:** hay que configurarlo en Google Cloud una vez, y mientras se
  ajusta puede dejar el despliegue inutilizable un rato.

No es urgente. Tiene sentido plantearlo cuando haya una ventana tranquila, no
justo antes de necesitar publicar algo.
