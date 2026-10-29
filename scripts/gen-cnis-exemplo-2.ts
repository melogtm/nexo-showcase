// Generates public/cnis-exemplo-sintetico-2.pdf: a fictitious client close to retirement, for the demo of the
// retirement alert and the planning simulation. Synthetic data only (CLAUDE.md, invariant 7).
// Run: npx tsx scripts/gen-cnis-exemplo-2.ts
import { writeFileSync } from "node:fs";
import { Temporal } from "temporal-polyfill";
import { renderCnis } from "@/cnis/synthetic";

const months = (from: string, to: string) => {
  const out: string[] = [];
  for (let m = Temporal.PlainYearMonth.from(from); Temporal.PlainYearMonth.compare(m, Temporal.PlainYearMonth.from(to)) <= 0; m = m.add({ months: 1 })) out.push(m.toString());
  return out;
};

const pdf = await renderCnis({
  emitidoEm: "20/10/2026 09:30:00",
  filiado: { nit: "123.45678.91-2", cpf: "000.000.000-00", nome: "FULANO SINTÉTICO DOS SANTOS", dataNascimento: "1962-03-20", nomeMae: "BELTRANA SINTÉTICA" },
  vinculos: [
    {
      tipo: "EMPREGO", seq: 1, nit: "123.45678.91-2", codigoEmp: "11.111.111/0001-11", origem: "INDÚSTRIA EXEMPLO S.A.",
      dataInicio: "1988-02-01", dataFim: "2001-06-30", tipoFiliado: "Empregado",
      indicadores: ["IEAN"],
      remuneracoes: months("1994-07", "2001-06").map((competencia) => ({ competencia, valorCentavos: 420_000 })),
    },
    {
      tipo: "EMPREGO", seq: 2, nit: "123.45678.91-2", codigoEmp: "22.222.222/0001-22", origem: "TRANSPORTES FICTÍCIOS LTDA",
      dataInicio: "2003-01-02", dataFim: "2024-12-31", tipoFiliado: "Empregado",
      remuneracoes: months("2003-01", "2024-12").map((competencia) => ({ competencia, valorCentavos: 510_000 })),
    },
  ],
  legenda: [{ codigo: "IEAN", descricao: "Exposição a agente nocivo informada" }],
});

writeFileSync("public/cnis-exemplo-sintetico-2.pdf", pdf);
console.log(`public/cnis-exemplo-sintetico-2.pdf (${pdf.length} bytes)`);
