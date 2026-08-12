import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Cierre de seguridad de la cuenta Gerente.
 *
 * Estas pruebas son de caja blanca (leen el código fuente real y
 * comprueban que la protección está escrita donde debe estar). Las
 * pruebas de EJECUCIÓN REAL de estas mismas protecciones, contra el
 * emulador de Firestore, están en
 * src/seguridad/cuentaPortal.emulador.test.ts -- ahí se comprueba que
 * de verdad deniegan, no solo que el código las menciona.
 */

const RAIZ = join(__dirname, "..", "..");
const leerFunction = (archivo: string) => readFileSync(join(RAIZ, "functions", "src", archivo), "utf8");
const leerFront = (ruta: string) => readFileSync(join(RAIZ, "src", ruta), "utf8");

/**
 * Quita comentarios antes de comprobar que algo NO está en el código.
 *
 * Sin esto, un comentario que EXPLICA por qué no confiamos en
 * `reauthenticated` haría fallar la prueba que comprueba que no lo
 * usamos -- castigando justo la documentación que queremos tener. Lo
 * que importa es que no esté en el código ejecutable.
 */
function sinComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linea) => !linea.trim().startsWith("//"))
    .join("\n");
}

describe("PROTECCIÓN: una cuenta no puede archivarse ni eliminarse a sí misma", () => {
  const cuentaPortal = leerFunction("cuentaPortal.ts");
  const usuarios = leerFunction("administrarUsuarioPortal.ts");

  it("existe una comprobación centralizada actorUid === objetivoUid", () => {
    expect(cuentaPortal).toContain("export function exigirQueNoSeaUnoMismo(");
    expect(cuentaPortal).toContain("if (objetivoUid && objetivoUid === actorUid)");
    expect(cuentaPortal).toContain('throw new HttpsError("permission-denied"');
  });

  it("archivar comprueba que el objetivo no sea uno mismo", () => {
    expect(usuarios).toMatch(/if \(accion === "archivar"\) \{\s*\n\s*exigirQueNoSeaUnoMismo\(gerente\.uid, uid\);/);
  });

  it("eliminar comprueba que el objetivo no sea uno mismo", () => {
    expect(usuarios).toContain("exigirQueNoSeaUnoMismo(\n    cuenta.uid,\n    uid,");
  });

  it("la protección vive en el BACKEND, no solo en la interfaz", () => {
    // Si esto se moviera solo al frontend, cualquiera lo saltaría desde
    // DevTools llamando la Function directamente con su propio uid.
    expect(cuentaPortal).toContain("exigirQueNoSeaUnoMismo");
    expect(usuarios).toContain("exigirQueNoSeaUnoMismo");
  });

  it("el frontend además esconde el botón sobre la propia cuenta", () => {
    const accesos = leerFront("components/screens/Accesos.tsx");
    expect(accesos).toContain("const esMiPropiaCuenta = Boolean(uidPropio && inv.uid === uidPropio)");
    expect(accesos).toContain("{esGerente && !esMiPropiaCuenta && (");
    expect(accesos).toContain("Es tu propia cuenta: no puedes archivarla ni eliminarla desde aquí.");
  });
});

describe("PROTECCIÓN: autenticación reciente para acciones críticas", () => {
  const cuentaPortal = leerFunction("cuentaPortal.ts");

  it("se comprueba auth_time del ID token, NO un booleano del navegador", () => {
    expect(cuentaPortal).toContain("export function exigirAutenticacionReciente(");
    expect(cuentaPortal).toContain("request.auth?.token?.auth_time");
    // Lo que NO debe existir jamás: confiar en algo que mande el body.
    const ejecutable = sinComentarios(cuentaPortal);
    expect(ejecutable).not.toContain("request.data?.reautenticado");
    expect(ejecutable).not.toContain("reauthenticated");
  });

  it("hay una ventana máxima explícita y corta", () => {
    expect(cuentaPortal).toContain("EDAD_MAXIMA_AUTENTICACION_RECIENTE_SEG = 5 * 60");
    expect(cuentaPortal).toContain("antiguedad > EDAD_MAXIMA_AUTENTICACION_RECIENTE_SEG");
  });

  it("señala a la interfaz que debe pedir la contraseña", () => {
    expect(cuentaPortal).toContain("{ requiereReautenticacion: true }");
  });

  it("archivar a OTRO Gerente exige autenticación reciente", () => {
    const usuarios = leerFunction("administrarUsuarioPortal.ts");
    expect(usuarios).toContain("await objetivoEsGerente(db, uid)");
    expect(usuarios).toContain("Vuelve a escribir tu contraseña para archivar a otro Gerente.");
  });

  it("eliminar a OTRO Gerente exige autenticación reciente", () => {
    const usuarios = leerFunction("administrarUsuarioPortal.ts");
    expect(usuarios).toContain("Vuelve a escribir tu contraseña para eliminar a otro Gerente.");
  });

  it("eliminar definitivamente un cliente exige autenticación reciente", () => {
    const clientes = leerFunction("administrarClienteAdmin.ts");
    expect(clientes).toContain("exigirAutenticacionReciente(");
    expect(clientes).toContain("eliminar definitivamente a este cliente");
  });

  it("el borrado masivo REAL de archivos exige autenticación reciente, la simulación no", () => {
    const limpieza = leerFunction("limpiarArchivosHuerfanos.ts");
    expect(limpieza).toMatch(/if \(confirmar\) \{\s*\n\s*exigirAutenticacionReciente\(/);
  });

  it("el frontend refresca el token tras reautenticar (si no, no sirve de nada)", () => {
    const reauth = leerFront("config/reautenticacion.ts");
    expect(reauth).toContain("reauthenticateWithCredential(");
    // getIdToken(true) es obligatorio: sin forzar el refresco el SDK
    // sigue mandando el token viejo con el auth_time viejo.
    expect(reauth).toContain("await usuario.getIdToken(true)");
  });
});

describe("PROTECCIÓN: cerrar todas mis sesiones", () => {
  const cerrar = leerFunction("cerrarMisSesiones.ts");

  it("exige cuenta activa", () => {
    expect(cerrar).toContain("await exigirCuentaActiva(request)");
  });

  it("solo permite cerrar las sesiones de la PROPIA cuenta", () => {
    expect(cerrar).toContain("if (objetivo && objetivo !== cuenta.uid)");
    expect(cerrar).toContain("Solo puedes cerrar las sesiones de tu propia cuenta.");
  });

  it("revoca los refresh tokens con el Admin SDK", () => {
    expect(cerrar).toContain("await getAuth().revokeRefreshTokens(cuenta.uid)");
  });

  it("marca sessionsRevokedAt para cortar también los ID tokens ya emitidos", () => {
    // revokeRefreshTokens por sí solo NO invalida un ID token vivo; sin
    // este sello, "expulsé al intruso" sería "lo expulso en hasta 1 hora".
    //
    // Se comprueba sobre el código SIN comentarios y sobre la escritura
    // real: la primera versión de esta prueba buscaba la palabra en todo
    // el archivo y pasaba igual con el campo borrado, porque el
    // comentario de aquí arriba ya la contenía. La detectó una prueba de
    // mutación; por eso ahora mira la línea que escribe de verdad.
    const ejecutable = sinComentarios(cerrar);
    expect(ejecutable).toContain("sessionsRevokedAt: ahora");
    expect(ejecutable).toMatch(/\.set\(\s*\n?\s*\{ sessionsRevokedAt/);
  });

  it("queda auditado", () => {
    expect(cerrar).toContain('auditar("sesiones_revocadas"');
  });

  it("NO archiva, NO elimina y NO cambia permisos", () => {
    const ejecutable = sinComentarios(cerrar);
    expect(ejecutable).not.toContain("archived");
    expect(ejecutable).not.toContain("deleteUser");
    expect(ejecutable).not.toContain("disabled");
    expect(ejecutable).not.toContain("role");
  });

  it("el mecanismo central rechaza sesiones anteriores al corte", () => {
    const cuentaPortal = leerFunction("cuentaPortal.ts");
    expect(cuentaPortal).toContain("const cortadasEn = segundosDe(data.sessionsRevokedAt)");
    expect(cuentaPortal).toContain("autenticadaEn < cortadasEn");
  });

  it("el frontend cierra también la sesión de este navegador", () => {
    const reauth = leerFront("config/reautenticacion.ts");
    expect(reauth).toContain("export async function cerrarTodasMisSesiones(");
    expect(reauth).toContain("await logout()");
  });

  it("el texto que ve el usuario dice exactamente qué pasa", () => {
    const perfil = leerFront("components/screens/Perfil.tsx");
    expect(perfil).toContain(
      "Se cerrarán las sesiones de Vista360 asociadas a tu cuenta. Tendrás que iniciar sesión nuevamente."
    );
  });
});

describe("MFA: Firebase es la fuente de verdad, no el navegador", () => {
  const mfa = leerFront("config/mfa.ts");
  const login = leerFront("components/LoginScreen.tsx");

  it("usa el generador oficial de Firebase, no un TOTP casero", () => {
    expect(mfa).toContain("TotpMultiFactorGenerator");
    expect(mfa).toContain("multiFactor(usuario).enroll(");
    expect(mfa).toContain("resolver.resolveSignIn(");
  });

  it("NO guardamos el secreto TOTP en ningún sitio nuestro", () => {
    const ejecutable = sinComentarios(mfa);
    expect(ejecutable).not.toContain("setDoc");
    expect(ejecutable).not.toContain("localStorage");
    expect(ejecutable).not.toMatch(/console\.(log|info|warn|error)\(/);
    // El endpoint de auditoría solo acepta el nombre del evento.
    const registro = sinComentarios(leerFunction("registrarEventoMfa.ts"));
    expect(registro).not.toContain("secret");
    expect(registro).toContain('evento !== "enrolado" && evento !== "desactivado"');
  });

  it("una contraseña correcta sin código NO crea sesión", () => {
    // El login solo guarda el resolver y espera; la sesión la crea
    // Firebase en completarLoginConCodigo().
    expect(login).toContain("if (pideSegundoFactor(error))");
    expect(login).toContain("setResolverMfa(resolver)");
    expect(login).toContain("await completarLoginConCodigo(resolverMfa, codigoMfa)");
  });

  it("no existe ninguna bandera local tipo mfaPassed que saltarse", () => {
    expect(sinComentarios(login)).not.toContain("mfaPassed");
    expect(sinComentarios(mfa)).not.toContain("mfaPassed");
  });

  it("MFA autentica identidad; NO otorga permisos", () => {
    // El rol sigue viniendo de portalUsers en el backend. Ni el módulo
    // de MFA ni el login tocan roles.
    const ejecutable = sinComentarios(mfa);
    expect(ejecutable).not.toContain("role");
    expect(ejecutable).not.toContain("admin");
  });

  it("desactivar el segundo factor pasa por reautenticación y queda auditado", () => {
    const modal = leerFront("components/MfaSetupModal.tsx");
    expect(modal).toContain("await reautenticar(contrasena)");
    expect(modal).toContain('registrarEnAuditoria("desactivado")');
  });

  it("avisa si el correo no está verificado (requisito de Firebase)", () => {
    expect(mfa).toContain("export function emailSinVerificar(");
  });
});

describe("REGLA: nunca se bloquea una cuenta automáticamente", () => {
  const limitador = leerFunction("limitador.ts");

  it("superar el límite de ritmo solo rechaza la operación", () => {
    expect(limitador).toContain("resource-exhausted");
  });

  it("el limitador NO archiva, NO deshabilita y NO revoca nada", () => {
    const ejecutable = sinComentarios(limitador);
    expect(ejecutable).not.toContain("archived");
    expect(ejecutable).not.toContain("disabled");
    expect(ejecutable).not.toContain("revokeRefreshTokens");
    expect(ejecutable).not.toContain("updateUser");
    expect(ejecutable).not.toContain("deleteUser");
  });

  it("revokeRefreshTokens solo se usa donde una persona lo pidió explícitamente", () => {
    // Archivar/eliminar (un Gerente lo decidió) y cerrar mis sesiones
    // (el propio dueño lo pidió). En ningún otro sitio.
    const permitidos = ["administrarUsuarioPortal.ts", "cerrarMisSesiones.ts"];
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const dir = join(RAIZ, "functions", "src");
    const conRevoke = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => sinComentarios(readFileSync(join(dir, f), "utf8")).includes("revokeRefreshTokens("));
    expect(conRevoke.sort()).toEqual(permitidos.sort());
  });
});
