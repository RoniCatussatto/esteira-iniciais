import { describe, expect, it } from "vitest";

/**
 * Testa a lógica de normalização de células da planilha BD.
 * A função normalizeCell converte "." e strings vazias para null.
 */
function normalizeCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === "" || str === ".") return null;
  return str;
}

describe("normalizeCell", () => {
  it("retorna null para valor null", () => {
    expect(normalizeCell(null)).toBeNull();
  });

  it("retorna null para valor undefined", () => {
    expect(normalizeCell(undefined)).toBeNull();
  });

  it("retorna null para string vazia", () => {
    expect(normalizeCell("")).toBeNull();
  });

  it("retorna null para ponto (campo sem dados na planilha)", () => {
    expect(normalizeCell(".")).toBeNull();
  });

  it("retorna null para string com apenas espaços", () => {
    expect(normalizeCell("   ")).toBeNull();
  });

  it("retorna string normalizada para valor válido", () => {
    expect(normalizeCell("SICOOB COOPEREMB")).toBe("SICOOB COOPEREMB");
  });

  it("remove espaços extras de valores válidos", () => {
    expect(normalizeCell("  R$ 12.086,46  ")).toBe("R$ 12.086,46");
  });

  it("converte números para string", () => {
    expect(normalizeCell(12345)).toBe("12345");
  });
});

/**
 * Testa o mapeamento de colunas da planilha BD para o modelo de devedor.
 */
describe("mapeamento de colunas da planilha BD", () => {
  const rowExemplo: Record<string, unknown> = {
    cooperativa: "SICOOB COOPEREMB",
    dataBordero: "25/06/2026",
    contratos: "1382249 / 6655480",
    valorBordero: "R$ 12.086,46 ",
    contrario_nome: "JEFERSON VIANA AMAZONAS",
    contrario_cpf: "061.147.572-38",
    vencBordero: "24/06/2026",
    contrario_endereco: "TRAVESSA DO SERINGAL, 639, CASA 79, MAUAZINHO, MANAUS/AM - CEP: 69075709",
    foro: "MANAUS",
    veiculo_modelo: ".",
    veiculo_ano: ".",
    veiculo_placa: ".",
    veiculo_renavam: ".",
    veiculo_chassis: ".",
  };

  it("extrai nome do devedor corretamente", () => {
    expect(normalizeCell(rowExemplo["contrario_nome"])).toBe("JEFERSON VIANA AMAZONAS");
  });

  it("extrai CPF corretamente", () => {
    expect(normalizeCell(rowExemplo["contrario_cpf"])).toBe("061.147.572-38");
  });

  it("normaliza campos de veículo ausentes (ponto) para null", () => {
    expect(normalizeCell(rowExemplo["veiculo_modelo"])).toBeNull();
    expect(normalizeCell(rowExemplo["veiculo_placa"])).toBeNull();
    expect(normalizeCell(rowExemplo["veiculo_chassis"])).toBeNull();
  });

  it("extrai valor do borderô com espaço extra e normaliza", () => {
    expect(normalizeCell(rowExemplo["valorBordero"])).toBe("R$ 12.086,46");
  });

  it("extrai foro corretamente", () => {
    expect(normalizeCell(rowExemplo["foro"])).toBe("MANAUS");
  });
});

describe("mapeamento de devedor com veículo", () => {
  const rowComVeiculo: Record<string, unknown> = {
    cooperativa: "SICOOB COOPEREMB",
    dataBordero: "25/06/2026",
    contratos: "1044799",
    valorBordero: "R$ 9.645,28 ",
    contrario_nome: "JOAO VICTOR SPINA GERMIN",
    contrario_cpf: "453.115.688-95",
    vencBordero: "24/06/2026",
    contrario_endereco: "RUA GERALDO FERRARI, 50, LÍVIA I, BOTUCATU/SP CEP: 18614068",
    foro: "BOTUCATU",
    veiculo_modelo: "HONDA/XRE 300 ABS",
    veiculo_ano: "2021/2021",
    veiculo_placa: "FLW1B43",
    veiculo_renavam: "1268543990",
    veiculo_chassis: "9C2ND1120MR103014",
  };

  it("extrai modelo do veículo corretamente", () => {
    expect(normalizeCell(rowComVeiculo["veiculo_modelo"])).toBe("HONDA/XRE 300 ABS");
  });

  it("extrai placa do veículo corretamente", () => {
    expect(normalizeCell(rowComVeiculo["veiculo_placa"])).toBe("FLW1B43");
  });

  it("extrai chassi do veículo corretamente", () => {
    expect(normalizeCell(rowComVeiculo["veiculo_chassis"])).toBe("9C2ND1120MR103014");
  });
});
