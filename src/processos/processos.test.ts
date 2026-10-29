import { expect, test } from "vitest";
import { buildCnj, courtOf, parseCnj } from "./cnj";
import { demoNumbers, demoProvider, demoSnapshot } from "./demo";
import { decimalToCentavos, jusbrasilProvider, normalizeTribproc, toIsoDate } from "./jusbrasil";
import { classify, decideStage } from "./stages";
import { getProcesso, importProcesso, listEventos, moveProcesso, resumeAuto, syncProcesso } from "./store";
import type { Movimento } from "./types";

const mov = (data: string, titulo: string, descricao: string | null = null): Movimento => ({ data, titulo, descricao });

test("CNJ numbers: validates the mod-97 check and normalises punctuation", () => {
  // Example number from the Jusbrasil API docs.
  expect(parseCnj("0016377-46.2015.8.07.0003")).toBe("0016377-46.2015.8.07.0003");
  expect(parseCnj("00163774620158070003")).toBe("0016377-46.2015.8.07.0003");
  expect(parseCnj("0016377-47.2015.8.07.0003")).toBeNull();
  expect(parseCnj("123")).toBeNull();
  expect(buildCnj("0016377", "2015", "8", "07", "0003")).toBe("0016377-46.2015.8.07.0003");
  expect(courtOf("0016377-46.2015.8.07.0003")).toBe("TJDF");
  expect(courtOf(buildCnj("5000001", "2024", "4", "03", "6301"))).toBe("TRF3");
  for (const n of demoNumbers(8)) expect(parseCnj(n)).toBe(n);
});

test("classify: the newest movement with a known meaning decides the column, and says why", () => {
  expect(classify({ arquivado: false, extinto: false, movimentos: [] })).toMatchObject({ stage: "NOVO" });
  expect(classify({ arquivado: false, extinto: false, movimentos: [mov("2026-01-02", "Distribuído por sorteio")] }).stage).toBe("NOVO");
  expect(classify({ arquivado: false, extinto: false, movimentos: [mov("2026-02-01", "Perícia designada"), mov("2026-01-02", "Distribuído")] }).stage).toBe("EM_ANDAMENTO");
  const julg = classify({ arquivado: false, extinto: false, movimentos: [mov("2026-03-05", "Conclusos para sentença"), mov("2026-01-02", "Distribuído")] });
  expect(julg).toMatchObject({ stage: "EM_JULGAMENTO", motivo: "Movimentação de 05/03/2026: Conclusos para sentença" });
  expect(classify({ arquivado: false, extinto: false, movimentos: [mov("2026-04-01", "Recurso inominado"), mov("2026-03-05", "Sentença")] }).stage).toBe("RECURSO");
  expect(classify({ arquivado: false, extinto: false, movimentos: [mov("2026-05-01", "Certidão", "Certificado o trânsito em julgado.")] }).stage).toBe("CONCLUIDO");
  // After the judgment becomes final, enforcing it (implantação, RPV) is work again.
  expect(classify({ arquivado: false, extinto: false, movimentos: [mov("2026-06-01", "Cumprimento de sentença"), mov("2026-05-01", "Trânsito em julgado")] }).stage).toBe("EM_ANDAMENTO");
  expect(classify({ arquivado: true, extinto: false, movimentos: [mov("2026-06-01", "Petição")] }).stage).toBe("CONCLUIDO");
  // Unrecognised text never silently drops the card into "Novo".
  expect(classify({ arquivado: false, extinto: false, movimentos: [mov("2026-06-01", "Ato ordinatório")] })).toMatchObject({ stage: "EM_ANDAMENTO", motivo: expect.stringContaining("sem etapa reconhecida") });
});

test("decideStage: a manual move holds until the court records something newer", () => {
  const auto = { stage: "RECURSO" as const, motivo: "x", movimento: mov("2026-04-10", "Recurso inominado") };
  expect(decideStage({ stage: "EM_JULGAMENTO", origem: "AUTO", alteradoEm: "2026-04-01" }, auto)).toEqual({ stage: "RECURSO", origem: "AUTO", changed: true });
  expect(decideStage({ stage: "CONCLUIDO", origem: "MANUAL", alteradoEm: "2026-04-10" }, auto)).toEqual({ stage: "CONCLUIDO", origem: "MANUAL", changed: false });
  expect(decideStage({ stage: "CONCLUIDO", origem: "MANUAL", alteradoEm: "2026-04-09" }, auto)).toEqual({ stage: "RECURSO", origem: "AUTO", changed: true });
});

test("normalizeTribproc: reads the documented Jusbrasil fields; money in integer centavos", () => {
  const s = normalizeTribproc(
    {
      numero: "0016377-46.2015.8.07.0003",
      classeNatureza: "Procedimento Comum Cível",
      assuntoExtra: "Aposentadoria por Idade",
      tribunal: "TJDFT",
      vara: "1ª Vara Cível",
      situacao: "Em andamento",
      valor: 12345.6,
      distribuicaoData: "2015-03-14T00:00:00",
      alteradoEm: "2026-10-01T10:00:00",
      arquivado: false,
      movs: [["2015-03-14", "Distribuído", "Distribuído por sorteio"], ["2026-09-30", "Conclusos para sentença", null], ["sem data", "x", "y"]],
      partes: [["MARIA DA SILVA", "Ativo", "000.000.000-00"], ["INSS", "Passivo"]],
    },
    "0016377-46.2015.8.07.0003",
  );
  expect(s).toMatchObject({ classe: "Procedimento Comum Cível", orgao: "1ª Vara Cível", valorCausaCentavos: 1_234_560, distribuidoEm: "2015-03-14", atualizadoNaFonteEm: "2026-10-01" });
  expect(s.movimentos.map((m) => m.data)).toEqual(["2026-09-30", "2015-03-14"]);
  expect(s.partes).toEqual([{ nome: "MARIA DA SILVA", polo: "Ativo" }, { nome: "INSS", polo: "Passivo" }]);
  expect(decimalToCentavos("R$ 1.234,50")).toBe(123_450);
  expect(decimalToCentavos("10")).toBe(1000);
  expect(decimalToCentavos("abc")).toBeNull();
  expect(toIsoDate("14/03/2015")).toBe("2015-03-14");
});

test("jusbrasilProvider: sends the bearer token and turns HTTP errors into readable messages", async () => {
  const calls: { url: string; auth: string | null }[] = [];
  const ok = (async (url: string, init: RequestInit) => {
    calls.push({ url, auth: new Headers(init.headers).get("Authorization") });
    return new Response(JSON.stringify({ movs: [["2026-01-01", "Distribuído", ""]] }), { status: 200 });
  }) as unknown as typeof fetch;
  const snap = await jusbrasilProvider("tok", ok).fetch("0016377-46.2015.8.07.0003");
  expect(snap.fonte).toBe("JUSBRASIL");
  expect(calls[0]).toEqual({ url: "https://op.digesto.com.br/api/base-judicial/tribproc/0016377-46.2015.8.07.0003?tipo_numero=5", auth: "Bearer tok" });
  const status = (n: number) => (async () => new Response("", { status: n })) as unknown as typeof fetch;
  await expect(jusbrasilProvider("tok", status(401)).fetch("x")).rejects.toThrow("token");
  await expect(jusbrasilProvider("tok", status(404)).fetch("x")).rejects.toThrow("não encontrado");
});

test("demo snapshots are deterministic and reveal more movements as time passes", () => {
  const n = demoNumbers(1)[0];
  expect(demoSnapshot(n, "2026-10-28")).toEqual(demoSnapshot(n, "2026-10-28"));
  expect(demoSnapshot(n, "2027-12-31").movimentos.length).toBeGreaterThanOrEqual(demoSnapshot(n, "2026-10-28").movimentos.length);
});

test("store: import, manual move, sync that respects it, resume auto; every change in the history", async () => {
  let hoje = "2026-10-28";
  const provider = demoProvider(() => hoje);
  const numero = demoNumbers(1, 7)[0];
  const id = await importProcesso({ numero: numero.replace(/\D/g, ""), clientLabel: " Cliente 9 " }, provider);
  const imported = (await getProcesso(id))!;
  expect(imported).toMatchObject({ numeroCnj: numero, clientLabel: "Cliente 9", stageOrigem: "AUTO", fonte: "DEMO" });
  await expect(importProcesso({ numero }, provider)).rejects.toThrow("já está no quadro");
  await expect(importProcesso({ numero: "123" }, provider)).rejects.toThrow("inválido");

  const target = imported.stage === "CONCLUIDO" ? "NOVO" : "CONCLUIDO";
  await moveProcesso(id, target, "nexo", "Acordo homologado fora dos autos");
  expect(await getProcesso(id)).toMatchObject({ stage: target, stageOrigem: "MANUAL" });

  // Same day: nothing newer from the court, the manual column holds.
  expect((await syncProcesso(id, provider)).changed).toBe(false);
  expect((await getProcesso(id))!.stage).toBe(target);

  await resumeAuto(id);
  expect(await getProcesso(id)).toMatchObject({ stage: imported.stage, stageOrigem: "AUTO" });

  hoje = "2028-01-01"; // far enough that the demo script reaches the archive
  const r = await syncProcesso(id, provider);
  expect(r.stage).toBe("CONCLUIDO");
  const eventos = await listEventos(id);
  expect(eventos.map((e) => e.tipo)).toContain("IMPORTADO");
  expect(eventos.filter((e) => e.origem === "MANUAL")).toHaveLength(1);
});
