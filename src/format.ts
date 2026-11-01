import { Temporal } from "temporal-polyfill";
import type { Status } from "@/timeline/timeline";

// The office's calendar (São Paulo) and Brazilian display formats for ISO domain values (YYYY-MM-DD dates, YYYY-MM competências, integer centavos).

/** Today in Brazil, as an ISO date. */
export const today = () => Temporal.Now.plainDateISO("America/Sao_Paulo").toString();

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

/** Audit timestamps (`Date`), shown in the office's time zone. */
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
export const brDateTime = (d: Date) => dateTime.format(d);

const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
/** "há 3 dias", from an ISO date compared with another ISO date (both São Paulo calendar days). */
export const daysAgo = (iso: string, hoje: string) => relative.format(-Temporal.PlainDate.from(iso).until(hoje).days, "day");

export const STATUS: Record<Status, { label: string; icon: string }> = {
  OK: { label: "OK", icon: "✓" },
  PENDENTE: { label: "Pendente", icon: "⏸" },
  REVISAR: { label: "Revisar", icon: "⚠" },
  EXCLUIDO: { label: "Excluído", icon: "✕" },
};
