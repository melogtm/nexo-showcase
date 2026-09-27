import { type BySexo, type RuleContext, type RuleOutcome, carenciaMeses, requisito, tempoDias } from "./core";

// Append-only: a behaviour change goes into ec103-art17.v2.ts plus new rule_version rows pointing at logic_version 2.
export type Art17Params = {
  dataCorte: string;
  tempoMinimoAnos: BySexo<number>;
  faltaMaximaAnosNaDataCorte: number;
  pedagioPercentual: number;
  carenciaMinimaMeses: number;
  diasPorAno: number;
};

/** Pedágio de 50%: só para quem, na data de corte, estava a até N anos do tempo mínimo; cumpre o que faltava + pedágio. */
export function art17v1(ctx: RuleContext, p: Art17Params, data: string): RuleOutcome {
  const s = ctx.sexo;
  const minimo = p.tempoMinimoAnos[s] * p.diasPorAno;
  const naCorte = tempoDias({ ...ctx, referencia: p.dataCorte < ctx.referencia ? p.dataCorte : ctx.referencia }, p.dataCorte);
  const faltava = Math.max(0, minimo - naCorte);
  if (faltava >= p.faltaMaximaAnosNaDataCorte * p.diasPorAno) {
    return { aplicavel: false, motivo: `Na data de corte faltavam ${faltava} dias; a regra exige menos de ${p.faltaMaximaAnosNaDataCorte * p.diasPorAno}.`, elegivel: false, requisitos: [] };
  }
  const requisitos = [
    requisito({ id: "tempo", label: "Tempo mínimo + pedágio", unidade: "dias", exigido: minimo + Math.ceil((faltava * p.pedagioPercentual) / 100), atual: tempoDias(ctx, data), param: "pedagioPercentual" }),
    requisito({ id: "carencia", label: "Carência", unidade: "meses", exigido: p.carenciaMinimaMeses, atual: carenciaMeses(ctx, data), param: "carenciaMinimaMeses" }),
  ];
  return { aplicavel: true, elegivel: requisitos.every((r) => r.atendido), requisitos };
}
