import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { count } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { logout } from "../login/actions";
import { Nav } from "./nav";
import { Icon } from "./ui";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const db = await getDb();
  const [[a], [p]] = await Promise.all([db.select({ n: count() }).from(schema.analysis), db.select({ n: count() }).from(schema.processo)]);
  const fonte = process.env.JUSBRASIL_API_TOKEN ? "Jusbrasil conectado" : "Processos: modo demonstração";
  return (
    <div className="app">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="Nexo, painel">
          <Image src="/icon.svg" alt="" width={28} height={28} priority />
          <span className="wordmark">Nexo</span>
        </Link>
        <div className="sidebar-cta">
          <Link href="/analises#nova" className="button button-block"><Icon name="plus" /> Nova análise</Link>
          <Link href="/processos#importar" className="button button-secondary button-block"><Icon name="plus" /> Importar processo</Link>
        </div>
        <div>
          <p className="eyebrow nav-label">Trabalho</p>
          <Nav counts={{ analises: a.n, processos: p.n }} />
        </div>
        <div className="sidebar-foot">
          <p className="source-chip" title="Configure JUSBRASIL_API_TOKEN para usar dados reais do Jusbrasil.">
            <span className={`dot ${process.env.JUSBRASIL_API_TOKEN ? "stage-CONCLUIDO" : "stage-EM_JULGAMENTO"}`} aria-hidden="true" /> {fonte}
          </p>
          <form action={logout}>
            <button type="submit" className="button button-ghost button-sm"><Icon name="logout" /> Sair</button>
          </form>
        </div>
      </aside>
      <div className="app-main">{children}</div>
    </div>
  );
}
