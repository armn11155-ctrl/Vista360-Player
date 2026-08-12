# Segundo factor (MFA) en cuentas Gerente y cómo NO quedarse fuera

Este documento cubre tres cosas: qué protege realmente el segundo factor, qué hay que activar antes de poder usarlo, y — lo más importante — cómo recuperar una cuenta Gerente si se pierde el teléfono con el autenticador.

**Lee la sección de recuperación ANTES de activar MFA en tu cuenta real.** Activar un segundo factor sin tener clara la salida es la forma más común de quedarse bloqueado fuera de tu propia herramienta.

---

## 1. Qué protege el segundo factor (y qué no)

**Sí protege**: que alguien que robó tu contraseña (phishing, filtración de otro sitio donde usabas la misma, malware que la capturó) pueda INICIAR SESIÓN como tú. Sin el código de tu autenticador, la contraseña sola no abre nada.

**NO protege**: una sesión que YA está abierta. Si alguien agarra tu teléfono desbloqueado con Vista360 abierto, el segundo factor no le pide nada — ya está dentro. Contra ese escenario protegen otras tres cosas, que están implementadas y probadas:

- **No puedes archivar ni eliminar tu propia cuenta** (ni desde la app ni llamando la Cloud Function a mano). Nadie te deja fuera de tu propia herramienta con tu propia sesión.
- **Las acciones críticas piden la contraseña otra vez** (ver tabla más abajo). Quien tenga tu sesión abierta pero no sepa tu contraseña no puede ejecutarlas.
- **"Cerrar todas mis sesiones"** en *Mi cuenta → Seguridad*: expulsa todas las sesiones, incluida la del intruso, de inmediato.

---

## 2. Requisitos antes de poder activar MFA

### 2.1 Identity Platform (decisión de facturación — requiere tu autorización)

TOTP no viene en el Firebase Authentication básico. Hace falta **Firebase Authentication with Identity Platform**, que es una actualización que se acepta desde la consola de Google Cloud.

- El plan gratuito cubre hasta **50 000 usuarios activos al mes**. Vista360 tiene del orden de decenas de cuentas, así que el coste esperado por el uso real es **cero**.
- Lo que sí cambia es que el proyecto pasa a un producto facturable de Google Cloud: si algún día se superara el tramo gratuito, empezaría a cobrarse por usuario activo.
- La actualización **no se puede revertir** con un clic.

**Esta decisión no la tomo yo.** Está pendiente de tu autorización explícita; en la sección 6 del informe se explica exactamente qué pantalla verás y qué hay que aceptar.

### 2.2 Correo verificado (bloqueante hoy)

Firebase **exige que el correo de la cuenta esté verificado** para poder enrolar un segundo factor. Hoy Vista360 crea todas las cuentas con `emailVerified: false` (se ve en `crearClienteAcceso.ts`, `crearTrabajadorAcceso.ts` y `crearClienteNuevo.ts`), porque las contraseñas las reparte el Gerente a mano y nunca hizo falta verificar nada.

Consecuencia práctica: **hoy ninguna cuenta puede enrolar MFA aunque activáramos Identity Platform ahora mismo.** Hay que verificar primero el correo de las cuentas Gerente. La app ya avisa de esto en el asistente en vez de fallar con un error críptico.

Formas de verificar el correo de una cuenta Gerente:

1. **Desde la consola de Firebase** (lo más rápido para 1-2 cuentas): Authentication → Users → seleccionar la cuenta → marcar el correo como verificado.
2. **Con el Admin SDK**: `getAuth().updateUser(uid, { emailVerified: true })` — apropiado solo si tú controlas y confías en esos buzones.
3. **Con el flujo oficial** (`sendEmailVerification`): el usuario recibe un correo y hace clic. Es lo correcto si algún día se abre el registro a gente de fuera.

---

## 3. Recuperación: "perdí el teléfono con Google Authenticator"

Este es el procedimiento, en orden. **No existe ningún atajo dentro de la app** — ni `?disableMFA=true`, ni PIN maestro, ni un secreto en el código. Si existiera, sería exactamente la puerta que usaría un atacante, y volvería inútil todo lo demás.

### Caso A — hay otro Gerente con acceso (el caso normal)

1. El Gerente afectado avisa a otro Gerente **por un canal donde se le reconozca** (llamada, en persona). No por correo: si le robaron la cuenta, también pueden tener el correo.
2. El otro Gerente entra a la **consola de Firebase → Authentication → Users**, busca la cuenta y **elimina el segundo factor** de esa cuenta.
   - Equivalente con el Admin SDK: `getAuth().updateUser(uid, { multiFactor: { enrolledFactors: [] } })`.
3. El afectado inicia sesión solo con contraseña y **vuelve a enrolar** su autenticador en el teléfono nuevo (*Mi cuenta → Seguridad → Autenticación en dos pasos*).
4. Si hay cualquier sospecha de que el teléfono perdido esté en malas manos, el afectado usa **"Cerrar todas mis sesiones"** en cuanto entre, para expulsar cualquier sesión que siguiera viva en ese aparato.

**Quién puede hacer el paso 2**: solo alguien con acceso a la consola de Firebase del proyecto — es decir, el propietario/administrador del proyecto en Google Cloud, no cualquier Gerente de Vista360 por serlo. Esa separación es intencional: el rol Gerente dentro de la app **no** debe poder quitarle el MFA a otro Gerente desde la app, porque entonces una cuenta Gerente robada podría desarmar el MFA de todas las demás.

### Caso B — break-glass: eres el único Gerente y lo perdiste todo

Contraseña, MFA y dispositivo, a la vez. La vía de recuperación está **fuera de Vista360**, y es la propiedad del proyecto de Google Cloud:

1. **Entra a la consola de Firebase** (https://console.firebase.google.com) con la **cuenta de Google propietaria del proyecto**. Ojo: esta es una cuenta de Google, no una cuenta de Vista360 — son sistemas distintos, y por eso este camino sigue existiendo aunque tu cuenta de Vista360 esté inaccesible.
2. Si tampoco puedes entrar a esa cuenta de Google, usa la **recuperación de cuenta de Google** (teléfono de respaldo, correo de respaldo, códigos de respaldo de Google). Este es el verdadero cimiento de todo: **si pierdes la cuenta de Google propietaria del proyecto, no hay nada dentro de Vista360 que pueda salvarte.**
3. Ya dentro: Authentication → Users → tu cuenta → quitar el segundo factor y, si hace falta, restablecer la contraseña.
4. Entra a Vista360, vuelve a enrolar el MFA y **crea una segunda cuenta Gerente** para no volver a estar en un único punto de fallo.

### Recomendaciones concretas para no llegar nunca al caso B

- **Ten siempre dos cuentas Gerente**, en manos de dos personas distintas (o al menos con dos autenticadores distintos). Es la medida más barata y la que más riesgo elimina.
- **Guarda la clave de texto del QR** al enrolar (la que aparece bajo "¿No puedes escanear?") en un gestor de contraseñas. Con ella puedes reconstruir el autenticador en un teléfono nuevo sin pasar por nadie.
- **Activa la verificación en dos pasos de la propia cuenta de Google** propietaria del proyecto, con códigos de respaldo impresos. Es el eslabón del que cuelga todo lo demás.

---

## 4. Desactivar el segundo factor

Quitar el MFA de una cuenta Gerente es una operación crítica y por eso pide:

- sesión válida,
- **contraseña reciente** (Firebase exige sesión reciente para tocar factores; la app la pide explícitamente),
- y queda **auditado** (`mfa_desactivado`, con uid y momento).

Esto es para quien **tiene** su autenticador y decide quitarlo. Quien lo **perdió** no puede llegar a esta pantalla (no puede iniciar sesión) y tiene que ir por la recuperación de la sección 3. Es a propósito: si "olvidé mi MFA" se pudiera resolver desde dentro de la app, el MFA no protegería de nada.

---

## 5. Clasificación de acciones: cuándo se pide la contraseña otra vez

El criterio es simple: **fricción solo donde el daño es grave e irreversible**. Pedir la contraseña para todo consigue que la gente la escriba sin mirar, que es peor que no pedirla.

| Acción | Clase | Qué se exige |
|---|---|---|
| Ver, listar, crear campañas, subir archivos, editar datos del día a día | NORMAL | Cuenta activa y rol |
| Archivar/restaurar un cliente o un trabajador | SENSIBLE | Confirmación + auditoría + límite de ritmo |
| Restablecer la contraseña de un cliente | SENSIBLE | Gerente + auditoría + límite de ritmo |
| Restaurar de la papelera | SENSIBLE | Gerente + auditoría + límite de ritmo |
| **Archivar a otro Gerente** | **CRÍTICA** | **Contraseña reciente** + auditoría |
| **Eliminar a otro Gerente** | **CRÍTICA** | **Contraseña reciente** + auditoría |
| **Eliminar definitivamente un cliente** (y todo lo suyo) | **CRÍTICA** | **Contraseña reciente** + auditoría |
| **Borrado masivo real de archivos** (`limpiarArchivosHuerfanos` con confirmar) | **CRÍTICA** | **Contraseña reciente** + auditoría |
| **Desactivar el segundo factor** | **CRÍTICA** | **Contraseña reciente** + auditoría |
| Archivar/eliminar **tu propia** cuenta | **IMPOSIBLE** | Denegado en el backend, siempre |
| Cambiar el correo de una cuenta | **NO EXISTE** | La app no permite cambiar correos (ver §6) |

"Contraseña reciente" significa: el ID token debe llevar un `auth_time` de hace menos de 5 minutos. Se comprueba en el servidor, sobre el token firmado por Google. **No** se acepta ningún campo del navegador que diga "ya me reautentiqué" — eso lo puede mandar cualquiera desde DevTools y no probaría nada.

---

## 6. Cambio de correo: no aplica

Vista360 **no permite cambiar el correo de ninguna cuenta** desde la app: no hay ninguna pantalla ni ninguna Cloud Function que llame a `updateEmail` o `verifyBeforeUpdateEmail`. El correo se fija al crear el acceso y no se toca más.

Eso cierra por completo el ataque de "cambio el correo de recuperación y desde ahí controlo la recuperación del MFA": no hay por dónde. Si algún día se añade esa función, tendrá que entrar en la tabla de arriba como **CRÍTICA**.

**VERIFICADO — NO APLICA.**

---

## 7. Lo que Vista360 NO hace, a propósito

No existe ningún bloqueo automático de cuentas. Superar un límite de ritmo hace que **la operación se rechace temporalmente**, y nada más: no se marca `archived`, no se marca `disabled`, no se revocan tokens y no se cambia ninguna contraseña.

Es una decisión deliberada: un falso positivo que archiva la cuenta del único Gerente en mitad de un día de trabajo hace más daño que el ataque que pretendía frenar. Hay una prueba permanente que falla si alguien añade ese comportamiento (`seguridadCuentaGerente.test.ts`, "REGLA: nunca se bloquea una cuenta automáticamente"), incluida una que comprueba que `revokeRefreshTokens` solo se llama en los dos sitios donde una persona lo pidió explícitamente.
