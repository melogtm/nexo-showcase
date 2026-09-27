import { type BySexo, type RuleContext, type RuleOutcome, carenciaMeses, floor2, idadeDias, requisito, tempoDias, year } from "./core";

// Append-only: a behaviour change goes into ec103-art15.v2.ts plus new rule_version rows pointing at logic_version 2.
export type Art15Params = {
  pontosBase: BySexo<number>;
  anoBase: number;
  incrementoAnual: number;
  pontosTeto: BySexo<number>;
  tempoMinimoAnos: BySexo<number>;
  carenciaMinimaMeses: number;
  diasPorAno: number;
};

/** Transição por pontos: idade + tempo (com frações) ≥ pontuação do ano, que sobe até um teto. */
export function art15v1(ctx: RuleContext, p: Art15Params, data: string): RuleOutcome {
  const s = ctx.sexo;
  const tempo = tempoDias(ctx, data);
  const exigidos = Math.min(p.pontosTeto[s], p.pontosBase[s] + Math.max(0, year(data) - p.anoBase) * p.incrementoAnual);
  const requisitos = [
    requisito({ id: "pontos", label: `Pontos (idade + tempo) exigidos em ${year(data)}`, unidade: "pontos", exigido: exigidos, atual: floor2((idadeDias(ctx, data) + tempo) / p.diasPorAno), param: `pontosBase.${s}` }),
    requisito({ id: "tempo", label: "Tempo de contribuição", unidade: "dias", exigido: p.tempoMinimoAnos[s] * p.diasPorAno, atual: tempo, param: `tempoMinimoAnos.${s}` }),
    requisito({ id: "carencia", label: "Carência", unidade: "meses", exigido: p.carenciaMinimaMeses, atual: carenciaMeses(ctx, data), param: "carenciaMinimaMeses" }),
  ];
  return { aplicavel: true, elegivel: requisitos.every((r) => r.atendido), requisitos };
}
