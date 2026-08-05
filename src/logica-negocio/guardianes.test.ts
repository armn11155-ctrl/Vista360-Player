import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * LOS GUARDIANES EN TIEMPO DE EJECUCIÓN, y por qué son exactamente estos
 * y no más.
 *
 * Un guardián que se dispara de más es peor que no tenerlo: se aprende a
 * ignorarlo y deja de avisar cuando hace falta. Así que cada uno tiene
 * que ganarse el sitio cumpliendo cuatro cosas:
 *
 *   1. Cubrir un fallo que el análisis estático NO puede ver.
 *   2. Exigir evidencia clara, no una sospecha.
 *   3. Costar prácticamente nada.
 *   4. Decir qué hacer, sin exponer datos de nadie.
 *
 * Este archivo fija esas propiedades para que no se relajen con el
 * tiempo, y deja constancia de los que se decidió NO añadir.
 */

const RAIZ = resolve(__dirname, "../..");
const bucles = readFileSync(resolve(__dirname, "../hooks/useDetectorDeBucles.ts"), "utf-8");
const paneles = readFileSync(resolve(__dirname, "../hooks/usePanelesDisponibles.ts"), "utf-8");
const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf-8");

describe("guardián 1: bucles de renderizado", () => {
  it("exige las TRES señales, no solo un ritmo alto", () => {
    // Solo "muchos renders" da falsos positivos: arrastrar el marcador
    // del mapa o redimensionar la ventana produce decenas por segundo.
    expect(bucles).toContain("ventanasSeguidas.current >= VENTANAS_SEGUIDAS");
    expect(bucles).toContain("silencio > SILENCIO_MS");
    expect(bucles).toMatch(/RENDERS_POR_VENTANA = \d+/);
  });

  it("el umbral está por encima de un uso intenso real", () => {
    const n = Number(/RENDERS_POR_VENTANA = (\d+)/.exec(bucles)![1]);
    expect(n).toBeGreaterThanOrEqual(50);
    const ventanas = Number(/VENTANAS_SEGUIDAS = (\d+)/.exec(bucles)![1]);
    expect(ventanas).toBeGreaterThanOrEqual(2);
  });

  it("escucha la interacción de forma pasiva, sin estorbar", () => {
    // `passive` garantiza que no puede retrasar un scroll ni un gesto.
    expect(bucles).toContain("{ passive: true, capture: true }");
    // Y se registra UNA sola vez en toda la vida de la página.
    expect(bucles).toContain("if (escuchasPuestas");
  });

  it("no hace trabajo pesado por render", () => {
    // Lo único que corre en cada render es aritmética. Nada de recorrer
    // el DOM, serializar objetos ni pedir tiempos de alta resolución.
    const cuerpo = bucles.slice(bucles.indexOf("export function useDetectorDeBucles"));
    expect(cuerpo).not.toMatch(/querySelector|getBoundingClientRect|JSON\.stringify|performance\.now/);
  });
});

describe("guardián 2: el barrido diario dejó de correr", () => {
  it("se mide por antigüedad, que aquí SÍ es una señal válida", () => {
    // Este documento se reescribe a diario corra o no corra nada, así
    // que si es viejo, el barrido no corrió.
    // Que exista la funcion no basta: hay que comprobar que se LLAMA, y
    // ademas desde donde llega el documento. Un mutante que borraba solo
    // la llamada pasaba el test anterior sin problema.
    expect(paneles).toContain("avisarSiElBarridoDejoDeCorrer(docSnap.data()?.actualizadoEn)");
    expect(paneles).toMatch(/DIAS_TOLERADOS = \d+/);
    const dias = Number(/DIAS_TOLERADOS = (\d+)/.exec(paneles)![1]);
    // Con menos de 2 dias avisaria por un simple retraso del cron.
    expect(dias).toBeGreaterThanOrEqual(2);
  });

  it("avisa una sola vez y dice qué revisar", () => {
    // La bandera tiene que estar EN LA CONDICION que corta, no solo
    // declarada: si no, avisa en cada llegada del documento.
    expect(paneles).toContain("if (yaAvisoDelBarrido ||");
    expect(paneles).toContain("yaAvisoDelBarrido = true;");
    expect(paneles).toContain("queHacer");
    expect(paneles).toContain("Sincronizar estado de paneles");
  });

  it("NO se aplica al resumen de cada cliente, y es a propósito", () => {
    // Ese solo cambia cuando alguien escribe: que sea viejo es normal.
    // Medirlo por antigüedad daría avisos constantes y falsos.
    const contratos = readFileSync(resolve(__dirname, "../hooks/useContratos.ts"), "utf-8");
    expect(contratos).not.toContain("DIAS_TOLERADOS");
  });
});

describe("ninguno expone datos de nadie", () => {
  it("los avisos solo llevan datos técnicos", () => {
    for (const [nombre, fuente] of [["bucles", bucles], ["paneles", paneles]] as const) {
      const avisos = [...fuente.matchAll(/console\.(error|warn)\(([\s\S]{0,700}?)\n\s*\}\);/g)];
      expect(avisos.length, `${nombre} debería tener algún aviso`).toBeGreaterThan(0);
      for (const a of avisos) {
        expect(a[2], `aviso en ${nombre}`).not.toMatch(
          /clienteId|cliente_id|\buid\b|email|\bruc\b|empresa|nombre:|token/i,
        );
      }
    }
  });

  it("la pantalla se anota por su nombre, no por su contenido", () => {
    expect(app).toContain("anotarRutaActual(view)");
    // `view` es "inicio", "cobertura"... nunca un identificador.
    expect(app).not.toMatch(/anotarRutaActual\((clienteId|uid|email)/);
  });
});

describe("los guardianes que se decidió NO añadir", () => {
  // Se dejan escritos para que la decisión sea explícita y revisable, no
  // un olvido.
  const DESCARTADOS = [
    [
      "contador de escuchas de Firestore",
      "una escucha que se resuscribe sin parar cuesta dinero, pero SIEMPRE viene de un " +
        "re-render descontrolado: lo caza el guardián 1. Y el patrón estático ya está cubierto. " +
        "Un tercer aviso para la misma causa solo añade ruido.",
    ],
    [
      "detector de fugas de memoria",
      "no hay ninguna señal barata y fiable desde el navegador. Cualquier heurística daría " +
        "falsos positivos, que es justo lo que arruina un guardián.",
    ],
    [
      "vigilante de promesas sin capturar",
      "el navegador ya las escribe en la consola por su cuenta. Duplicarlo no añade nada.",
    ],
    [
      "medidor de trabajo pesado en el render",
      "requiere muestrear tiempos en cada render, que es precisamente el coste que se quiere " +
        "evitar. Y su consecuencia visible --que la pantalla no cambia-- ya la cubre el reloj " +
        "de guardia de las transiciones.",
    ],
  ];

  for (const [nombre, motivo] of DESCARTADOS) {
    it(`descartado: ${nombre} — ${motivo.slice(0, 60)}...`, () => {
      expect(motivo.length).toBeGreaterThan(40);
    });
  }

  it("el reloj de guardia de las transiciones sigue en pie", () => {
    // Es el cuarto guardián, de antes: si un cambio de pantalla no se
    // completa, recarga. Cubre la consecuencia de cualquier bloqueo,
    // venga de donde venga.
    expect(app).toContain("ESPERA_MAXIMA_CAMBIO_MS");
    expect(app).toContain("recargarPorVersionDesactualizada()");
  });
});
