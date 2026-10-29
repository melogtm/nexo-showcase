// Numeração única do CNJ (Resolução 65/2008): NNNNNNN-DD.AAAA.J.TR.OOOO, with an ISO 7064 mod 97 check (DD).

/** The canonical, punctuated CNJ number, or null when the input is not 20 digits with a valid check. */
export function parseCnj(input: string): string | null {
  const d = input.replace(/\D/g, "");
  if (d.length !== 20) return null;
  const [n, dd, aaaa, j, tr, o] = [d.slice(0, 7), d.slice(7, 9), d.slice(9, 13), d.slice(13, 14), d.slice(14, 16), d.slice(16, 20)];
  if (BigInt(`${n}${aaaa}${j}${tr}${o}${dd}`) % 97n !== 1n) return null;
  return `${n}-${dd}.${aaaa}.${j}.${tr}.${o}`;
}

/** The two check digits for the other 18 (used by the demo generator). */
export function cnjCheckDigits(n: string, aaaa: string, j: string, tr: string, o: string): string {
  return String(98n - (BigInt(`${n}${aaaa}${j}${tr}${o}00`) % 97n)).padStart(2, "0");
}

export function buildCnj(n: string, aaaa: string, j: string, tr: string, o: string): string {
  return `${n}-${cnjCheckDigits(n, aaaa, j, tr, o)}.${aaaa}.${j}.${tr}.${o}`;
}

const UF_BY_TR = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SE", "SP", "TO"];

/** The court a CNJ number belongs to, from its J.TR segment. Previdenciário cases are mostly federal (J = 4). */
export function courtOf(cnj: string): string | null {
  const m = /\.(\d)\.(\d{2})\.\d{4}$/.exec(cnj);
  if (!m) return null;
  const [, j, tr] = m;
  if (j === "4") return `TRF${Number(tr)}`;
  if (j === "8") return UF_BY_TR[Number(tr) - 1] ? `TJ${UF_BY_TR[Number(tr) - 1]}` : null;
  if (j === "5") return `TRT${Number(tr)}`;
  return null;
}
