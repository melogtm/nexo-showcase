import { type BySexo, type RuleContext, type RuleOutcome, carenciaMeses, idadeMeses, requisito, tempoDias } from "./core";

// Append-only: a behaviour change goes into ec103-art20.v2.ts plus new rule_version rows pointing at logic_version 2.
export type Art20Params = {
  dataCorte: string;
  idadeMinimaAnos: BySexo<number>;
  tempoMinimoAnos: BySexo<number>;
  pedagioPercentual: number;
  carenciaMinimaMeses: number;
  diasPorAno: number;
};

/** Pedágio de 100%: idade mínima + tempo mínimo + 100% do tempo que faltava na data de corte. */
export function art20v1(ctx: RuleContext, p: Art20Params, data: string): RuleOutcome {
  const s = ctx.sexo;
  const minimo = p.tempoMinimoAnos[s] * p.diasPorAno;
  const naCorte = tempoDias({ ...ctx, referencia: p.dataCorte < ctx.referencia ? p.dataCorte : ctx.referencia }, p.dataCorte);
  const faltava = Math.max(0, minimo - naCorte);
  const requisitos = [
    requisito({ id: "idade", label: "Idade mínima", unidade: "idadeMeses", exigido: p.idadeMinimaAnos[s] * 12, atual: idadeMeses(ctx, data), param: `idadeMinimaAnos.${s}` }),
    requisito({ id: "tempo", label: "Tempo mínimo + pedágio", unidade: "dias", exigido: minimo + Math.ceil((faltava * p.pedagioPercentual) / 100), atual: tempoDias(ctx, data), param: "pedagioPercentual" }),
    requisito({ id: "carencia", label: "Carência", unidade: "meses", exigido: p.carenciaMinimaMeses, atual: carenciaMeses(ctx, data), param: "carenciaMinimaMeses" }),
  ];
  return { aplicavel: true, elegivel: requisitos.every((r) => r.atendido), requisitos };
}
