import { describe, expect, it } from "vitest";
import { filtrarClientes, ordenarClientesPorCampanasActivas } from "./clientPicker";
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

describe("ordenarClientesPorCampanasActivas", () => {
  it("pone primero al cliente con más campañas activas y al final al que no tiene", () => {
    const resultado = ordenarClientesPorCampanasActivas(clientes, {
      "1": 2,
      "2": 0,
      "3": 5,
    });

    expect(resultado.map((cliente) => cliente.id)).toEqual(["3", "1", "2"]);
  });

  it("ordena alfabéticamente cuando dos clientes tienen el mismo número de campañas", () => {
    const resultado = ordenarClientesPorCampanasActivas(clientes, {
      "1": 1,
      "2": 1,
      "3": 1,
    });

    expect(resultado.map((cliente) => cliente.empresa)).toEqual(["Bububots", "Iwjaj", "YUY8Y8Y80"]);
  });

  it("no modifica la lista original", () => {
    const original = [...clientes];
    ordenarClientesPorCampanasActivas(clientes, { "3": 4 });
    expect(clientes).toEqual(original);
  });
});
