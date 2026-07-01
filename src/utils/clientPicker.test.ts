import { describe, expect, it } from "vitest";
import { filtrarClientes } from "./clientPicker";
import type { Cliente } from "../types";

const clientes = [
  { id: "1", empresa: "Bububots" } as Cliente,
  { id: "2", empresa: "Iwjaj" } as Cliente,
  { id: "3", empresa: "YUY8Y8Y80" } as Cliente,
];

describe("filtrarClientes", () => {
  it("devuelve todos los clientes cuando la búsqueda está vacía", () => {
    expect(filtrarClientes(clientes, "")).toEqual(clientes);
  });

  it("filtra sin distinguir mayúsculas/minúsculas", () => {
    expect(filtrarClientes(clientes, "bubu")).toEqual([clientes[0]]);
    expect(filtrarClientes(clientes, "BUBU")).toEqual([clientes[0]]);
  });

  it("ignora espacios al inicio/fin de la búsqueda", () => {
    expect(filtrarClientes(clientes, "  iwjaj  ")).toEqual([clientes[1]]);
  });

  it("devuelve lista vacía si ningún cliente coincide", () => {
    expect(filtrarClientes(clientes, "no existe")).toEqual([]);
  });

  it("nunca devuelve un cliente de otra empresa (aislamiento básico de datos)", () => {
    const resultado = filtrarClientes(clientes, "Bububots");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].empresa).toBe("Bububots");
  });
});
