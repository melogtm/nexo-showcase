import Image from "next/image";
import Link from "next/link";
import { logout } from "../login/actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand" aria-label="Nexo, início">
          <Image src="/icon.svg" alt="" width={34} height={34} priority />
          <span className="wordmark">Nexo</span>
        </Link>
        <form action={logout}>
          <button type="submit" className="link-button">Sair</button>
        </form>
      </header>
      <main className="container">{children}</main>
      <footer className="container footer">
        <span className="mark">✱ NEXO</span> Do CNIS à petição · Projeto acadêmico ACH2008, EACH/USP · Use apenas CNIS sintético nesta instância.
      </footer>
    </>
  );
}
