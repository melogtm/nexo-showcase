import { afterEach, expect, test, vi } from "vitest";
import { importProcesso } from "@/processos/store";
import { demoNumbers } from "@/processos/demo";
import { GET } from "./route";

// The only route outside src/proxy.ts's session check: its Bearer check is the whole protection.
const call = (authorization?: string) =>
  GET(new Request("http://localhost/api/cron/sincronizar-processos", { headers: authorization ? { authorization } : {} }));

afterEach(() => vi.unstubAllEnvs());

test("cron sync: closed without CRON_SECRET, 401 on a missing or wrong token, counts only on success", async () => {
  vi.stubEnv("JUSBRASIL_API_TOKEN", ""); // demo provider: no network
  vi.stubEnv("CRON_SECRET", "");
  expect((await call("Bearer anything")).status).toBe(503);

  vi.stubEnv("CRON_SECRET", "s3cret");
  expect((await call()).status).toBe(401);
  expect((await call("Bearer s3creX")).status).toBe(401); // same length: exercises timingSafeEqual
  expect((await call("s3cret")).status).toBe(401); // the secret without the Bearer scheme

  await importProcesso({ numero: demoNumbers(1)[0] });
  const ok = await call("Bearer s3cret");
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ total: 1, mudaram: 0, novas: 0, erros: 0 });
});
