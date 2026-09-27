// Brazilian display formats for ISO domain values (YYYY-MM-DD dates, YYYY-MM competências, integer centavos).
export const brDate = (iso: string) => iso.split("-").reverse().join("/");
export const brMonth = (yearMonth: string) => yearMonth.split("-").reverse().join("/");
export function brMoney(centavos: number) {
  const digits = String(centavos).padStart(3, "0");
  return `${digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${digits.slice(-2)}`;
}
