// npm run smoke -- <baseUrl>  read-only: logs in with NEXO_USER/NEXO_PASSWORD and GETs every main page. Safe on prod.
// Exits 1 on the first page that does not answer 200, so CI and post-deploy checks can gate on it.
import { createSession, credentials, SESSION_COOKIE } from "@/auth";

const arg = process.argv[2];
if (!arg) throw new Error("Uso: npm run smoke -- <baseUrl>");

const base = arg.replace(/\/$/, "");
const creds = credentials();
if (!creds) throw new Error("Set NEXO_PASSWORD (and NEXO_USER if not 'nexo').");
const cookie = `${SESSION_COOKIE}=${createSession(creds)}`;

// redirect: manual, so a rejected session shows up as a 307 to /login instead of a 200 login page.
async function get(path: string, { auth = true, expect = [200] } = {}) {
  const res = await fetch(`${base}${path}`, { headers: auth ? { cookie } : {}, redirect: "manual" }).catch((e: Error) => {
    console.log(`FAIL unreachable ${base}${path}: ${(e.cause as { code?: string } | undefined)?.code ?? e.message}`);
    process.exit(1);
  });
  const html = await res.text();
  const ok = expect.includes(res.status) && !html.includes("__next_error__");
  console.log(`${ok ? "ok  " : "FAIL"} ${res.status} ${path}`);
  if (!ok) process.exit(1);
  return html;
}
const first = (html: string, re: RegExp) => re.exec(html)?.[1];

await get("/login", { auth: false });
await get("/", { auth: false, expect: [307] }); // the session check is on
await get("/api/cron/sincronizar-processos", { auth: false, expect: [401, 503] }); // closed: never sends the secret, so no paid sync runs
await get("/");
const analises = await get("/analises");
const processos = await get("/processos");

const analysis = first(analises, /href="\/analises\/(\d+)"/);
const run = first(analises, /href="\/analises\/\d+\/cenarios\/(\d+)"/);
const runAnalysis = first(analises, /href="\/analises\/(\d+)\/cenarios\/\d+"/);
const processo = first(processos, /href="\/processos\/(\d+)"/);

if (analysis) {
  await get(`/analises/${analysis}`);
  await get(`/analises/${analysis}?ver=todos`);
  await get(`/analises/${analysis}/documentos`);
} else console.log("skip no analysis yet");
if (run && runAnalysis) {
  await get(`/analises/${runAnalysis}/cenarios/${run}`);
  await get(`/analises/${runAnalysis}/cenarios/${run}/relatorio`);
} else console.log("skip no calculation yet");
if (processo) await get(`/processos/${processo}`);
else console.log("skip no processo yet");
console.log("smoke ok");
