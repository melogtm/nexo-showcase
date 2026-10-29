import { type Movimento, type Parte, ProcessoError, type ProcessoProvider, type ProcessoSnapshot } from "./types";

// Jusbrasil Soluções API, "Consulta processual · consulta única" (https://api.jusbrasil.com.br/docs/saneamento_base/consulta_unica.html):
//   GET https://op.digesto.com.br/api/base-judicial/tribproc/<numero CNJ>?tipo_numero=5
//   Authorization: Bearer <token>
// The token comes from JUSBRASIL_API_TOKEN (a paid Jusbrasil Soluções contract). Never log it or the response (personal data).

export const JUSBRASIL_BASE_URL = process.env.JUSBRASIL_API_URL ?? "https://op.digesto.com.br/api";

export function jusbrasilProvider(token: string, fetchImpl: typeof fetch = fetch): ProcessoProvider {
  return {
    fonte: "JUSBRASIL",
    async fetch(numeroCnj) {
      const url = `${JUSBRASIL_BASE_URL}/base-judicial/tribproc/${encodeURIComponent(numeroCnj)}?tipo_numero=5`;
      let res: Response;
      try {
        res = await fetchImpl(url, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(20_000),
          cache: "no-store",
        });
      } catch {
        throw new ProcessoError("Não foi possível falar com o Jusbrasil agora. Tente sincronizar de novo em instantes.");
      }
      if (res.status === 401 || res.status === 403) throw new ProcessoError("O Jusbrasil recusou o token de acesso. Confira JUSBRASIL_API_TOKEN.");
      if (res.status === 404) throw new ProcessoError("Processo não encontrado no Jusbrasil.");
      if (res.status === 429) throw new ProcessoError("Limite de consultas do Jusbrasil atingido. Tente mais tarde.");
      if (!res.ok) throw new ProcessoError(`O Jusbrasil respondeu com erro (${res.status}).`);
      return normalizeTribproc(await res.json(), numeroCnj);
    },
  };
}

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** ISO date from the formats the API is known to use: ISO date-times and dd/mm/yyyy. */
export function toIsoDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
}

/** Integer centavos from 1234.5, "1234.50", "1.234,50" or "R$ 1.234,50", without float arithmetic. */
export function decimalToCentavos(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  let s = typeof v === "number" ? (Number.isFinite(v) ? v.toFixed(2) : "") : String(v).trim().replace(/^R\$\s*/, "");
  s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const c = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(c) ? (m[1] ? -c : c) : null;
}

/** `movs` entries are positional arrays: [0] date, [1] type/title, [2] description (per the docs). */
function movimento(m: unknown): Movimento | null {
  if (!Array.isArray(m)) return null;
  const data = toIsoDate(m[0]);
  if (!data) return null;
  const descricao = str(m[2]);
  const titulo = str(m[1]) ?? (descricao ? descricao.split("\n")[0].slice(0, 120) : "Movimentação");
  return { data, titulo, descricao: descricao && descricao !== titulo ? descricao : null };
}

const POLO = /\b(ativo|passivo|autor[a]?|r[ée]u|requerente|requerid[oa]|reclamante|reclamad[oa]|recorrente|recorrid[oa]|exequente|executad[oa])\b/i;

/** [VALIDAR] `partes` positions are not documented: take the first name-like text and any polo-like text. */
function parte(p: unknown): Parte | null {
  if (p && typeof p === "object" && !Array.isArray(p)) {
    const o = p as Json;
    const nome = str(o.nome) ?? str(o.name);
    return nome ? { nome, polo: str(o.polo) ?? str(o.tipo) } : null;
  }
  if (!Array.isArray(p)) return null;
  const texts = p.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
  const polo = texts.find((t) => POLO.test(t) && t.length < 40) ?? null;
  const nome = texts.find((t) => t !== polo && /[a-zà-ú]{2}/i.test(t) && !/^\d[\d.\-/]*$/.test(t));
  return nome ? { nome, polo } : null;
}

export function normalizeTribproc(raw: unknown, numeroCnj: string): ProcessoSnapshot {
  if (!raw || typeof raw !== "object") throw new ProcessoError("Resposta do Jusbrasil em formato inesperado.");
  const j = raw as Json;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const classes = list(j.classes).map(str).filter(Boolean) as string[];
  return {
    numeroCnj,
    fonte: "JUSBRASIL",
    classe: str(j.classeNatureza) ?? classes[0] ?? null,
    assunto: str(j.assuntoExtra) ?? str(j.area),
    tribunal: str(j.tribunal),
    orgao: str(j.vara) ?? str(j.vara_original) ?? str(j.foro),
    comarca: str(j.comarca),
    uf: str(j.uf),
    juiz: str(j.juiz),
    situacao: str(j.situacao),
    valorCausaCentavos: decimalToCentavos(j.valor),
    distribuidoEm: toIsoDate(j.distribuicaoData),
    arquivado: j.arquivado === true,
    extinto: j.extinto === true,
    partes: list(j.partes).map(parte).filter((x): x is Parte => x !== null),
    movimentos: list(j.movs)
      .map(movimento)
      .filter((x): x is Movimento => x !== null)
      .sort((a, b) => b.data.localeCompare(a.data)),
    atualizadoNaFonteEm: toIsoDate(j.alteradoEm),
  };
}
