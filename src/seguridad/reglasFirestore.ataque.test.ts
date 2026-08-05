import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from "firebase/firestore";

/**
 * ESCENARIOS DE ATAQUE contra las reglas de Firestore, ejecutados de
 * verdad contra el emulador.
 *
 * A diferencia del resto de tests del proyecto, estos NO leen el código:
 * levantan un Firestore real con las reglas de firestore.rules y hacen
 * las mismas peticiones que haría un atacante desde la consola del
 * navegador con una sesión legítima.
 *
 * Necesitan el emulador de Firestore (y por tanto Java 21), así que
 * corren en su propio job del CI -- no en la suite normal.
 *
 * Personajes:
 *   cliente-a  -> usuario del cliente "empresa-a" (privilegio más bajo)
 *   cliente-b  -> usuario del cliente "empresa-b" (la víctima)
 *   gerente    -> personal interno de Vista360
 *   anonimo    -> sin sesión
 */

let entorno: RulesTestEnvironment;

beforeAll(async () => {
  entorno = await initializeTestEnvironment({
    projectId: "vista360-reglas-test",
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf-8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await entorno?.cleanup();
});

beforeEach(async () => {
  await entorno.clearFirestore();
  // Datos de partida, escritos saltándose las reglas (como haría el
  // backend con el Admin SDK).
  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "portalUsers/uid-cliente-a"), { role: "cliente", clienteId: "empresa-a", nombre: "A" });
    await setDoc(doc(db, "portalUsers/uid-cliente-b"), { role: "cliente", clienteId: "empresa-b", nombre: "B" });
    await setDoc(doc(db, "portalUsers/uid-gerente"), { role: "admin", nombre: "Gerente" });
    await setDoc(doc(db, "clientes/empresa-a"), { empresa: "Empresa A", ruc: "111" });
    await setDoc(doc(db, "clientes/empresa-b"), { empresa: "Empresa B", ruc: "222" });
    await setDoc(doc(db, "contratos/c-de-a"), { cliente_id: "empresa-a", monto: 5000, fin: "2027-01-01" });
    await setDoc(doc(db, "contratos/c-de-b"), { cliente_id: "empresa-b", monto: 9000, fin: "2027-01-01" });
    await setDoc(doc(db, "facturas/f-de-b"), { cliente_id: "empresa-b", cliente_doc: "222", total: 9000 });
    await setDoc(doc(db, "paneles/p1"), { nombre: "Mural", estado: "Disponible" });
    await setDoc(doc(db, "solicitudesCampana/s-de-b"), { cliente_id: "empresa-b", nombre: "Campaña B", estado: "Pendiente" });
    await setDoc(doc(db, "invitacionesPortal/i1"), { clienteId: "empresa-a", email: "a@a.com" });
  });
});

/**
 * Cuenta con sesión de Firebase pero SIN ficha en portalUsers.
 *
 * Es el escenario que antes abría la puerta grande: las reglas viejas
 * tenían isHuman() = "tiene sesión y NO es cuenta de portal", y a eso le
 * daban acceso de administrador del ERP (gastos, sueldos, proveedores,
 * editar clientes, borrar contratos). Bastaba con conseguir una cuenta
 * cualquiera del proyecto para tenerlo todo.
 */
const sinFichaDePortal = () => entorno.authenticatedContext("uid-desconocido").firestore();

const comoClienteA = () => entorno.authenticatedContext("uid-cliente-a").firestore();
const comoClienteB = () => entorno.authenticatedContext("uid-cliente-b").firestore();
const comoGerente = () => entorno.authenticatedContext("uid-gerente").firestore();
const sinSesion = () => entorno.unauthenticatedContext().firestore();

// ─────────────────────────────────────────────────────────────
describe("ATAQUE 1: escalar privilegios haciéndose administrador", () => {
  it("un cliente NO puede escribirse role:'admin' en su propio perfil", async () => {
    // El ataque más grave posible: da acceso a los datos de TODOS los
    // clientes. Se haría con dos líneas en la consola del navegador.
    await assertFails(updateDoc(doc(comoClienteA(), "portalUsers/uid-cliente-a"), { role: "admin" }));
  });

  it("tampoco puede cambiarse el clienteId para adueñarse de otra empresa", async () => {
    await assertFails(updateDoc(doc(comoClienteA(), "portalUsers/uid-cliente-a"), { clienteId: "empresa-b" }));
  });

  it("no puede tocar el perfil de OTRO usuario", async () => {
    await assertFails(updateDoc(doc(comoClienteA(), "portalUsers/uid-cliente-b"), { role: "cliente" }));
  });

  it("no puede crearse un perfil nuevo con rol de administrador", async () => {
    await assertFails(setDoc(doc(comoClienteA(), "portalUsers/uid-inventado"), { role: "admin" }));
  });

  it("ni siquiera un cambio inofensivo pasa: la escritura está cerrada del todo", async () => {
    await assertFails(updateDoc(doc(comoClienteA(), "portalUsers/uid-cliente-a"), { nombre: "Otro" }));
  });
});

// ─────────────────────────────────────────────────────────────
describe("ATAQUE 2: leer datos de otro cliente", () => {
  it("un cliente NO puede leer las campañas de otro (montos, fechas, paneles)", async () => {
    await assertFails(getDoc(doc(comoClienteA(), "contratos/c-de-b")));
  });

  it("un cliente NO puede listar TODAS las campañas quitando el filtro", async () => {
    await assertFails(getDocs(collection(comoClienteA(), "contratos")));
  });

  it("un cliente NO puede consultar campañas poniendo el id de otro", async () => {
    const q = query(collection(comoClienteA(), "contratos"), where("cliente_id", "==", "empresa-b"));
    await assertFails(getDocs(q));
  });

  it("un cliente NO puede leer las facturas de otro", async () => {
    await assertFails(getDoc(doc(comoClienteA(), "facturas/f-de-b")));
  });

  it("un cliente NO puede leer la ficha de otra empresa", async () => {
    await assertFails(getDoc(doc(comoClienteA(), "clientes/empresa-b")));
  });

  it("un cliente NO puede leer el perfil de otro usuario", async () => {
    await assertFails(getDoc(doc(comoClienteA(), "portalUsers/uid-cliente-b")));
  });

  it("un cliente NO puede leer las solicitudes de otro", async () => {
    await assertFails(getDoc(doc(comoClienteA(), "solicitudesCampana/s-de-b")));
  });

  it("un cliente NO puede ver la lista de accesos (pantalla de admin)", async () => {
    await assertFails(getDocs(collection(comoClienteA(), "invitacionesPortal")));
  });
});

// ─────────────────────────────────────────────────────────────
describe("ATAQUE 3: modificar datos que no le pertenecen", () => {
  it("un cliente NO puede cambiar el monto de su propia campaña", async () => {
    // Aunque sea suya: los contratos se tocan solo por Cloud Function.
    await assertFails(updateDoc(doc(comoClienteA(), "contratos/c-de-a"), { monto: 1 }));
  });

  it("un cliente NO puede cambiar el monto de la campaña de otro", async () => {
    await assertFails(updateDoc(doc(comoClienteA(), "contratos/c-de-b"), { monto: 1 }));
  });

  it("un cliente NO puede marcar una factura como pagada", async () => {
    await assertFails(updateDoc(doc(comoClienteA(), "facturas/f-de-b"), { pagado: true }));
  });

  it("un cliente NO puede alterar el inventario de paneles", async () => {
    await assertFails(updateDoc(doc(comoClienteA(), "paneles/p1"), { estado: "Disponible" }));
  });

  it("un cliente NO puede editar su propia ficha de empresa", async () => {
    await assertFails(updateDoc(doc(comoClienteA(), "clientes/empresa-a"), { empresa: "Otro nombre" }));
  });
});

// ─────────────────────────────────────────────────────────────
describe("ATAQUE 4: sin haber iniciado sesión", () => {
  it("no puede leer campañas", async () => {
    await assertFails(getDoc(doc(sinSesion(), "contratos/c-de-a")));
  });
  it("no puede leer clientes", async () => {
    await assertFails(getDoc(doc(sinSesion(), "clientes/empresa-a")));
  });
  it("no puede leer perfiles", async () => {
    await assertFails(getDoc(doc(sinSesion(), "portalUsers/uid-cliente-a")));
  });
  it("no puede leer el inventario de paneles", async () => {
    await assertFails(getDoc(doc(sinSesion(), "paneles/p1")));
  });
  it("no puede escribir nada", async () => {
    await assertFails(setDoc(doc(sinSesion(), "contratos/nuevo"), { cliente_id: "empresa-a" }));
  });
});

// ─────────────────────────────────────────────────────────────
describe("ATAQUE 5: colecciones no previstas", () => {
  it("una colección nueva sin regla queda inaccesible (cierre por defecto)", async () => {
    await assertFails(getDoc(doc(comoClienteA(), "coleccionInventada/x")));
    await assertFails(setDoc(doc(comoClienteA(), "coleccionInventada/x"), { a: 1 }));
  });
});

// ─────────────────────────────────────────────────────────────
describe("Lo que SÍ debe seguir funcionando (que la seguridad no rompa la app)", () => {
  it("un cliente lee su propio perfil (de ahí sale su rol al entrar)", async () => {
    await assertSucceeds(getDoc(doc(comoClienteA(), "portalUsers/uid-cliente-a")));
  });

  it("un cliente lee su propia ficha de empresa", async () => {
    await assertSucceeds(getDoc(doc(comoClienteA(), "clientes/empresa-a")));
  });

  it("un cliente consulta SUS campañas", async () => {
    const q = query(collection(comoClienteA(), "contratos"), where("cliente_id", "==", "empresa-a"));
    await assertSucceeds(getDocs(q));
  });

  it("un cliente ve el inventario de paneles (Cobertura se lo muestra entero)", async () => {
    await assertSucceeds(getDocs(collection(comoClienteA(), "paneles")));
  });

  it("un cliente consulta SUS solicitudes", async () => {
    const q = query(collection(comoClienteA(), "solicitudesCampana"), where("cliente_id", "==", "empresa-a"));
    await assertSucceeds(getDocs(q));
  });

  it("el gerente lee los datos de cualquier cliente", async () => {
    await assertSucceeds(getDoc(doc(comoGerente(), "contratos/c-de-b")));
    await assertSucceeds(getDoc(doc(comoGerente(), "clientes/empresa-b")));
    await assertSucceeds(getDocs(collection(comoGerente(), "invitacionesPortal")));
  });

  it("NI SIQUIERA EL GERENTE puede ya escribir una solicitud desde el navegador", async () => {
    // Antes esta era la única escritura permitida desde el navegador: el
    // gerente marcaba el estado con un updateDoc acotado a dos campos.
    // Se cerró (allow update: if false) y pasó a
    // actualizarEstadoSolicitud, que valida el estado y regenera el
    // resumen del cliente en el mismo paso.
    //
    // No es solo higiene: mientras ese camino estuvo abierto, guardar
    // las solicitudes en el resumen del cliente era imposible -- se
    // habría desfasado al marcar una como revisada, sin forma de
    // enterarse.
    await assertFails(
      updateDoc(doc(comoGerente(), "solicitudesCampana/s-de-b"), {
        estado: "Revisada",
        estadoActualizadoEn: new Date(),
      })
    );
  });

  it("y tampoco puede reescribir su contenido", async () => {
    await assertFails(
      updateDoc(doc(comoGerente(), "solicitudesCampana/s-de-b"), { cliente_id: "empresa-a" })
    );
  });

  it("un cliente NO puede marcar sus propias solicitudes como revisadas", async () => {
    await assertFails(
      updateDoc(doc(comoClienteB(), "solicitudesCampana/s-de-b"), { estado: "Revisada" })
    );
  });
});

// ─────────────────────────────────────────────────────────────
describe("ATAQUE 6: la puerta trasera de isHuman() (cuenta sin ficha de portal)", () => {
  /**
   * Antes, cualquier cuenta de Firebase sin documento en portalUsers era
   * tratada como dueña del ERP. Si el registro por correo estuviera
   * abierto en Authentication, cualquiera podía crearse una cuenta y
   * quedarse con todo. Estos tests comprueban que esa vía está cerrada.
   */

  it("no puede leer campañas de nadie", async () => {
    await assertFails(getDoc(doc(sinFichaDePortal(), "contratos/c-de-a")));
  });

  it("no puede leer clientes", async () => {
    await assertFails(getDoc(doc(sinFichaDePortal(), "clientes/empresa-a")));
  });

  it("no puede leer perfiles ajenos", async () => {
    await assertFails(getDoc(doc(sinFichaDePortal(), "portalUsers/uid-cliente-a")));
  });

  it("no puede borrar una campaña", async () => {
    await assertFails(deleteDoc(doc(sinFichaDePortal(), "contratos/c-de-a")));
  });

  it("no puede editar la ficha de un cliente", async () => {
    await assertFails(updateDoc(doc(sinFichaDePortal(), "clientes/empresa-a"), { empresa: "Mío" }));
  });

  it("no puede tocar el inventario de paneles", async () => {
    await assertFails(updateDoc(doc(sinFichaDePortal(), "paneles/p1"), { estado: "Mantenimiento" }));
  });

  it("no puede leer facturas", async () => {
    await assertFails(getDoc(doc(sinFichaDePortal(), "facturas/f-de-b")));
  });
});

// ─────────────────────────────────────────────────────────────
describe("ATAQUE 7: colecciones del ERP retirado", () => {
  /**
   * gastos, proveedores, sueldos, configuracion y config eran del ERP
   * Vista360, que ya no se usa. Los datos siguen en Firestore, pero no
   * deben ser accesibles desde ningún navegador.
   */
  const coleccionesRetiradas = ["gastos", "proveedores", "sueldos", "configuracion", "config", "solicitudesWeb"];

  it.each(coleccionesRetiradas)("nadie puede leer «%s»", async (col) => {
    await assertFails(getDoc(doc(comoClienteA(), `${col}/x`)));
    await assertFails(getDoc(doc(comoGerente(), `${col}/x`)));
    await assertFails(getDoc(doc(sinFichaDePortal(), `${col}/x`)));
  });

  it.each(coleccionesRetiradas)("nadie puede escribir en «%s»", async (col) => {
    await assertFails(setDoc(doc(comoGerente(), `${col}/x`), { a: 1 }));
    await assertFails(setDoc(doc(sinFichaDePortal(), `${col}/x`), { a: 1 }));
  });

  it("el formulario público de la web ya no puede crear solicitudes", async () => {
    // Antes solicitudesWeb aceptaba creación SIN sesión (la web pública).
    await assertFails(
      setDoc(doc(sinSesion(), "solicitudesWeb/nueva"), {
        contacto: "X", empresa: "Y", celular: "9", email: "a@b.c",
        panelInteres: "", notas: "", tipo: "Prospecto",
        estado: "En contacto", origen: "web",
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────
describe("Concesiones retiradas: funciones que no existen en la app", () => {
  it("un cliente NO puede calificar su campaña (esa función no existe)", async () => {
    await assertFails(
      updateDoc(doc(comoClienteA(), "contratos/c-de-a"), { calificacion: 5 })
    );
  });

  it("un cliente NO puede adjuntar comprobantes a una solicitud (no existe)", async () => {
    await assertFails(
      updateDoc(doc(comoClienteB(), "solicitudesCampana/s-de-b"), { comprobantePagoUrl: "x" })
    );
  });

  it("el personal NO puede confirmar pagos por esta vía (no existe)", async () => {
    await assertFails(
      updateDoc(doc(comoGerente(), "solicitudesCampana/s-de-b"), { pagoConfirmado: true })
    );
  });
});

// ─────────────────────────────────────────────────────────────
describe("ATAQUE 8: la copia agregada del inventario", () => {
  beforeEach(async () => {
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "agregados/paneles"), {
        paneles: [{ id: "p1", nombre: "Mural", estado: "Disponible" }],
        total: 1,
      });
    });
  });

  it("un cliente con sesión SÍ puede leerla (Cobertura la necesita)", async () => {
    await assertSucceeds(getDoc(doc(comoClienteA(), "agregados/paneles")));
  });

  it("sin sesión NO se puede leer", async () => {
    await assertFails(getDoc(doc(sinSesion(), "agregados/paneles")));
  });

  it("una cuenta sin ficha de portal tampoco", async () => {
    await assertFails(getDoc(doc(sinFichaDePortal(), "agregados/paneles")));
  });

  it("NADIE puede escribirla desde el navegador, ni el gerente", async () => {
    // La mantienen las Cloud Functions con el Admin SDK. Si el navegador
    // pudiera escribirla, un cliente podría inventarse paneles o cambiar
    // su estado para todos los demás.
    await assertFails(setDoc(doc(comoClienteA(), "agregados/paneles"), { paneles: [] }));
    await assertFails(setDoc(doc(comoGerente(), "agregados/paneles"), { paneles: [] }));
  });
});

// ─────────────────────────────────────────────────────────────
// Dentro de `agregados` ya no vive solo el inventario de paneles, que es
// público para todo el portal. Viven también la LISTA DE CLIENTES y el
// RESUMEN DE CADA CLIENTE. La regla vieja (`allow read: if
// esCuentaDePortal()` para todo el grupo) habría dejado que cualquier
// cliente leyera los datos de todos los demás con solo cambiar la URL.
describe("ATAQUE 9: los agregados con datos de clientes", () => {
  beforeEach(async () => {
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      const bd = ctx.firestore();
      await setDoc(doc(bd, "agregados/clientes-0"), {
        clientes: [{ id: "empresa-a", empresa: "Empresa A" }, { id: "empresa-b", empresa: "Empresa B" }],
        partes: 1,
      });
      await setDoc(doc(bd, "agregados/cliente-empresa-a"), { contratos: [], solicitudes: [] });
      await setDoc(doc(bd, "agregados/cliente-empresa-b"), { contratos: [], solicitudes: [] });
    });
  });

  it("un CLIENTE no puede leer la lista de todos los clientes", async () => {
    // Serían los nombres de toda la cartera de Vista360.
    await assertFails(getDoc(doc(comoClienteA(), "agregados/clientes-0")));
  });

  it("el gerente SÍ puede (es su pantalla de inicio)", async () => {
    await assertSucceeds(getDoc(doc(comoGerente(), "agregados/clientes-0")));
  });

  it("un cliente SÍ puede leer SU propio resumen", async () => {
    await assertSucceeds(getDoc(doc(comoClienteA(), "agregados/cliente-empresa-a")));
  });

  it("pero NO el resumen de otro cliente", async () => {
    // El id va en la ruta: cambiarla es el ataque obvio. La regla compara
    // contra el clienteId que consta en portalUsers, no contra la URL.
    await assertFails(getDoc(doc(comoClienteA(), "agregados/cliente-empresa-b")));
  });

  it("sin sesión no se puede leer ninguno", async () => {
    await assertFails(getDoc(doc(sinSesion(), "agregados/clientes-0")));
    await assertFails(getDoc(doc(sinSesion(), "agregados/cliente-empresa-a")));
  });

  it("nadie puede escribirlos desde el navegador", async () => {
    await assertFails(setDoc(doc(comoGerente(), "agregados/clientes-0"), { clientes: [] }));
    await assertFails(
      setDoc(doc(comoClienteA(), "agregados/cliente-empresa-a"), { contratos: [] })
    );
  });
});
