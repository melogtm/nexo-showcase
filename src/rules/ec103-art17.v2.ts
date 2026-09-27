import { type RuleContext, type RuleOutcome, carenciaMeses, requisito, tempoDias } from "./core";
import type { Art17Params } from "./ec103-art17.v1";

// v2 (same parameters as v1): the cut-off condition is reported as a numeric requirement instead of a sentence
// with raw day counts, so the UI can format it and the trail can link it to its parameter. Results are otherwise
// identical to v1. v1 stays for runs that used it.
export function art17v2(ctx: RuleContext, p: Art17Params, data: string): RuleOutcome {
  const s = ctx.sexo;
  const minimo = p.tempoMinimoAnos[s] * p.diasPorAno;
  const naCorte = tempoDias({ ...ctx, referencia: p.dataCorte < ctx.referencia ? p.dataCorte : ctx.referencia }, p.dataCorte);
  const faltava = Math.max(0, minimo - naCorte);
  const limite = p.faltaMaximaAnosNaDataCorte * p.diasPorAno;
  const corte = requisito({ id: "corte", label: "Tempo que faltava na data de corte", unidade: "dias", exigido: limite, atual: faltava, param: "faltaMaximaAnosNaDataCorte", comparacao: "maximo" });
  if (!corte.atendido) return { aplicavel: false, motivo: "Na data de corte faltava tempo demais para esta regra.", elegivel: false, requisitos: [corte] };
  const requisitos = [
    corte,
    requisito({ id: "tempo", label: "Tempo mínimo + pedágio", unidade: "dias", exigido: minimo + Math.ceil((faltava * p.pedagioPercentual) / 100), atual: tempoDias(ctx, data), param: "pedagioPercentual" }),
    requisito({ id: "carencia", label: "Carência", unidade: "meses", exigido: p.carenciaMinimaMeses, atual: carenciaMeses(ctx, data), param: "carenciaMinimaMeses" }),
  ];
  return { aplicavel: true, elegivel: requisitos.every((r) => r.atendido), requisitos };
}
