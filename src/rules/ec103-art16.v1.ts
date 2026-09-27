import { type BySexo, type RuleContext, type RuleOutcome, carenciaMeses, idadeMeses, requisito, tempoDias, year } from "./core";

// Append-only: a behaviour change goes into ec103-art16.v2.ts plus new rule_version rows pointing at logic_version 2.
export type Art16Params = {
  idadeBaseMeses: BySexo<number>;
  anoBase: number;
  incrementoMesesPorAno: number;
  idadeTetoMeses: BySexo<number>;
  tempoMinimoAnos: BySexo<number>;
  carenciaMinimaMeses: number;
  diasPorAno: number;
};

/** Transição por idade mínima progressiva: a idade exigida sobe a cada ano até um teto. */
export function art16v1(ctx: RuleContext, p: Art16Params, data: string): RuleOutcome {
  const s = ctx.sexo;
  const idadeExigida = Math.min(p.idadeTetoMeses[s], p.idadeBaseMeses[s] + Math.max(0, year(data) - p.anoBase) * p.incrementoMesesPorAno);
  const requisitos = [
    requisito({ id: "idade", label: `Idade mínima exigida em ${year(data)}`, unidade: "idadeMeses", exigido: idadeExigida, atual: idadeMeses(ctx, data), param: `idadeBaseMeses.${s}` }),
    requisito({ id: "tempo", label: "Tempo de contribuição", unidade: "dias", exigido: p.tempoMinimoAnos[s] * p.diasPorAno, atual: tempoDias(ctx, data), param: `tempoMinimoAnos.${s}` }),
    requisito({ id: "carencia", label: "Carência", unidade: "meses", exigido: p.carenciaMinimaMeses, atual: carenciaMeses(ctx, data), param: "carenciaMinimaMeses" }),
  ];
  return { aplicavel: true, elegivel: requisitos.every((r) => r.atendido), requisitos };
}
