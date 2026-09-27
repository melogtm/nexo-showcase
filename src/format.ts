// Brazilian display formats for ISO domain values (YYYY-MM-DD dates, YYYY-MM competências, integer centavos).
export const brDate = (iso: string) => iso.split("-").reverse().join("/");
export const brMonth = brDate; // YYYY-MM → MM/YYYY
export function brMoney(centavos: number) {
  const digits = String(centavos).padStart(3, "0");
  return `${digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${digits.slice(-2)}`;
}

// [VALIDAR] Display convention only (365-day years, 30-day months); eligibility compares days, never this.
export function brDuracao(dias: number) {
  const anos = Math.floor(dias / 365);
  const meses = Math.floor((dias % 365) / 30);
  const resto = (dias % 365) % 30;
  return `${anos}a ${meses}m ${resto}d`;
}
const integer = new Intl.NumberFormat("pt-BR");
export const brNumber = (n: number) => integer.format(n);
