import { type BySexo, type RuleContext, type RuleOutcome, carenciaMeses, idadeMeses, requisito, tempoDias } from "./core";

// Append-only: a behaviour change goes into ec103-art19.v2.ts plus new rule_version rows pointing at logic_version 2.
export type Art19Params = { idadeMinimaAnos: BySexo<number>; tempoMinimoAnos: BySexo<number>; carenciaMinimaMeses: number; diasPorAno: number };

/** Regra permanente: idade mínima + tempo mínimo + carência. */
export function art19v1(ctx: RuleContext, p: Art19Params, data: string): RuleOutcome {
  const s = ctx.sexo;
  const requisitos = [
    requisito({ id: "idade", label: "Idade mínima", unidade: "idadeMeses", exigido: p.idadeMinimaAnos[s] * 12, atual: idadeMeses(ctx, data), param: `idadeMinimaAnos.${s}` }),
    requisito({ id: "tempo", label: "Tempo de contribuição", unidade: "dias", exigido: p.tempoMinimoAnos[s] * p.diasPorAno, atual: tempoDias(ctx, data), param: `tempoMinimoAnos.${s}` }),
    requisito({ id: "carencia", label: "Carência", unidade: "meses", exigido: p.carenciaMinimaMeses, atual: carenciaMeses(ctx, data), param: "carenciaMinimaMeses" }),
  ];
  return { aplicavel: true, elegivel: requisitos.every((r) => r.atendido), requisitos };
}
