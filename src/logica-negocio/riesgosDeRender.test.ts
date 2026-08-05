import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";

/**
 * LA FAMILIA COMPLETA de bucles, re-renders inútiles y bloqueos.
 *
 * rendersInnecesarios.test.ts cubre UNA vía: referencias inestables en
 * arrays de dependencias. Esto cubre las otras diez, porque el bug que
 * nos costó un día fue solo una de ellas y no hay motivo para pensar que
 * la próxima será la misma.
 *
 * Lo que tienen en común, y por lo que hacen falta pruebas estáticas:
 * NINGUNA da error. No hay excepción, no hay pantalla rota, muchas veces
 * el DOM ni se mueve. Se manifiestan como "la app va rara" o "ese botón
 * no hace nada", que es justo lo que no se puede depurar.
 */

const RAIZ = resolve(__dirname, "../..");
const DETECTOR = resolve(RAIZ, "scripts/detectar-riesgos-render.mjs");

interface Riesgo {
  tipo: string;
  archivo: string;
  linea: number;
  detalle: string;
}

function analizar(dir?: string): Riesgo[] {
  const args = [DETECTOR, "--json", ...(dir ? [`--dir=${dir}`] : [])];
  return JSON.parse(execFileSync("node", args, { encoding: "utf-8", cwd: RAIZ }));
}

/** Analiza un fragmento suelto, escribiéndolo dentro de src/. */
/**
 * Analiza un fragmento en un directorio TEMPORAL PROPIO.
 *
 * Antes se escribia dentro de src/, y entonces la prueba de "src/ esta
 * limpio" veia los fragmentos de las otras pruebas corriendo en paralelo
 * y fallaba al azar.
 */
function analizarFragmento(codigo: string): Riesgo[] {
  const dir = mkdtempSync(join(tmpdir(), "riesgos-"));
  writeFileSync(join(dir, "Fragmento.tsx"), codigo, "utf-8");
  try {
    return analizar(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("la aplicación está limpia de toda la familia", () => {
  it("no hay ningún riesgo de re-renderizado en src/", () => {
    const encontrados = analizar().map((r) => `${r.tipo} — ${r.archivo}:${r.linea} — ${r.detalle}`);
    expect(encontrados).toEqual([]);
  });
});

/**
 * Cada caso trae el fragmento MÍNIMO que lo reproduce. Si alguien toca
 * el detector y lo rompe, estos fallan -- que es lo importante: un test
 * que solo comprueba "no hay hallazgos" pasa igual de bien con el
 * detector desactivado.
 */
describe("el detector reconoce cada vía de la familia", () => {
  const CASOS: Array<[string, string, string]> = [
    [
      "setState en el render",
      "llamar a un setter en el cuerpo del componente: render -> setState -> render",
      `export default function C() {
  const [n, setN] = useState(0);
  setN(1);
  return null;
}`,
    ],
    [
      "efecto sin dependencias con setState",
      "un useEffect sin `[]` corre en CADA render; con setState dentro, es un bucle",
      `export default function C() {
  const [n, setN] = useState(0);
  useEffect(() => { setN(n + 1); });
  return null;
}`,
    ],
    [
      "funcion del render como dependencia",
      "una función se redefine en cada render: como dependencia, SIEMPRE cambia",
      `export default function C() {
  const cargar = () => console.log(1);
  useEffect(() => { cargar(); }, [cargar]);
  return null;
}`,
    ],
    [
      "efecto que se realimenta",
      "el efecto depende de `n` y actualiza `n`: ciclo cerrado",
      `export default function C() {
  const [n, setN] = useState(0);
  useEffect(() => { setN(n + 1); }, [n]);
  return null;
}`,
    ],
    [
      "value de Context en linea",
      "un objeto nuevo en el Provider re-renderiza a TODOS los consumidores",
      `export default function C() {
  return <Ctx.Provider value={{ a: 1 }}>x</Ctx.Provider>;
}`,
    ],
    [
      "recurso sin limpiar",
      "un setInterval sin clearInterval sigue corriendo tras desmontar",
      `export default function C() {
  useEffect(() => { setInterval(() => console.log(1), 1000); }, []);
  return null;
}`,
    ],
    [
      "useState con inicializador no perezoso",
      "useState(calcular()) ejecuta calcular() en cada render y tira el resultado",
      `export default function C() {
  const [a] = useState(calcular());
  return null;
}`,
    ],
    [
      "key inestable",
      "un key distinto cada vez DESTRUYE y recrea el componente: pierde estado y relanza sus escuchas",
      `export default function C() { return <div key={Math.random()} />; }`,
    ],
    [
      "bucle sin salida",
      "while(true) sin break congela el hilo principal",
      `export default function C() { while (true) { console.log(1); } }`,
    ],
    [
      "animacion sin cancelar",
      "un requestAnimationFrame recursivo corre 60 veces por segundo para siempre",
      `export default function C() {
  useEffect(() => {
    function tick() { requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
    return () => {};
  }, []);
  return null;
}`,
    ],
  ];

  for (const [tipo, porQue, fragmento] of CASOS) {
    it(`detecta: ${tipo} (${porQue})`, () => {
      const encontrados = analizarFragmento(fragmento);
      expect(encontrados.map((r) => r.tipo)).toContain(tipo);
    });
  }
});

describe("y NO se queja de lo que está bien", () => {
  it("un setter dentro de un manejador de eventos no es realimentación", () => {
    // `onClick={() => setX(...)}` se dispara con la persona, no con el
    // render. Era el falso positivo más ruidoso de esa regla.
    expect(
      analizarFragmento(`export default function C() {
  const [sel, setSel] = useState(null);
  useEffect(() => {
    boton.on("click", () => setSel(1));
  }, [sel]);
  return null;
}`).map((r) => r.tipo),
    ).not.toContain("efecto que se realimenta");
  });

  it("un efecto CON función de limpieza no se marca", () => {
    expect(
      analizarFragmento(`export default function C() {
  useEffect(() => {
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);
  return null;
}`),
    ).toEqual([]);
  });

  it("useState(() => calcular()) es correcto y no se marca", () => {
    expect(
      analizarFragmento(`export default function C() {
  const [a] = useState(() => calcular());
  return null;
}`),
    ).toEqual([]);
  });
});
