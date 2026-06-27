# Vista360 Player

Portal web para los **clientes (anunciantes)** de Vista360 — entran con su
cuenta y ven sus propias campañas: estado, evidencias fotográficas de sus
anuncios en los paneles, y reportes mensuales. El dueño también tiene una
cuenta admin aquí mismo para subir evidencias y revisar cualquier cliente.
Usa el **mismo proyecto de Firebase** que
[Vista360](https://github.com/armn11155-ctrl/Vista360) (el ERP interno),
pero cada cliente solo ve sus propios datos — nunca los de otro cliente ni
información financiera interna (eso se administra aparte, en Vista360).

## Cómo funciona

1. El dueño le crea la cuenta a cada cliente (o a sí mismo, como admin) con
   un script (ver más abajo) — **no hay auto-registro**.
2. Inicia sesión con su correo y contraseña.
3. La app busca su vínculo en `portalUsers/{uid}`: si es `role:"cliente"`,
   ve directo sus propias campañas. Si es `role:"admin"`, primero elige a
   qué cliente quiere ver.
4. Desde ahí, todo lo que ve viene de Firestore en tiempo real:
   - **Inicio**: resumen (campañas activas, pantallas, última evidencia, próximo vencimiento)
   - **Mis campañas**: sus contratos, con estado derivado de fecha (Activa/Programada/Finalizada). El admin además ve si el informe del mes ya se envió.
   - **Detalle**: info de la campaña y del panel, con galería de evidencias. El admin tiene además el botón para subir nuevas.
   - **Evidencias**: las fotos reales de `contrato.fotos_campania`
   - **Perfil**: datos de la cuenta, cerrar sesión. El admin además puede cambiar de cliente.
   - **Nueva campaña**: formulario que crea una solicitud en `solicitudesCampana` (el dueño la revisa desde Vista360, igual que ya hace con `solicitudesWeb`)
   - **Reportes**: lista los informes PDF mensuales reales (los genera Vista360 automáticamente, ver su README)

## Setup local

```bash
git clone git@github.com:armn11155-ctrl/Vista360-Player.git
cd Vista360-Player
npm install
cp .env.example .env.local
```

Completa `.env.local` con las **mismas credenciales de Firebase que usa
Vista360** (las encuentras en su `.env.local`, sección `VITE_FIREBASE_*`).

```bash
npm run dev       # http://localhost:5174
```

## ⚠️ Pasos obligatorios en Firebase / Vista360 antes de usarlo

Este portal necesita reglas de Firestore que dejen a un cliente leer
**solo sus propios** `contratos`/`clientes`, sin tocar nada financiero
interno. Ya preparé ese cambio (`firestore.rules` + el script de creación
de cuentas) para subir al repo **Vista360** — avísame y lo subo ahí, y
luego se despliega una vez con:

```bash
cd ../Vista360
firebase deploy --only firestore:rules
```

## Crear accesos

Con el script `scripts/crear-acceso-cliente.mjs` (en el repo Vista360):

```bash
# Cliente — ve solo sus propias campañas
node --env-file=.env.local scripts/crear-acceso-cliente.mjs <cliente_id> <email>

# Admin (tú) — ve y gestiona TODOS los clientes, puede subir evidencias
node --env-file=.env.local scripts/crear-acceso-cliente.mjs admin <email>
```

En ambos casos, Firebase manda automáticamente un correo con un link para
crear la contraseña — nadie comparte contraseñas en texto plano.

**Diferencia entre las dos cuentas dentro de la app:**
- **Cliente**: entra directo a sus campañas. Solo puede ver — nunca sube fotos.
- **Admin**: primero elige a qué cliente quiere ver (selector), y desde ahí
  puede subir evidencias (botón "📷 Subir evidencia" en el detalle de cada
  campaña) y ver si el informe mensual de ese cliente ya se envió.

## Deploy a producción

Igual que Vista360: se despliega como sitio estático en Cloudflare Pages
(`npm run build` → carpeta `dist/`). Configura las variables `VITE_*` en
Cloudflare Pages → Settings → Environment variables.
