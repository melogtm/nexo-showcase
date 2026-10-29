import Image from "next/image";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar · Nexo" };

export default function LoginPage() {
  return (
    <div className="login">
      <section className="login-brand">
        <span className="mark">✱ NEXO</span>
        <h1 className="display">
          Nexo
          <em>do CNIS à petição.</em>
        </h1>
        <ul>
          <li>Linha do tempo do CNIS revisada e auditável</li>
          <li>Cenários de aposentadoria com a origem de cada número</li>
          <li>Quadro de processos atualizado pelo Jusbrasil</li>
        </ul>
      </section>
      <section className="login-panel">
        <Image src="/nexo-logo.png" alt="Nexo" width={72} height={80} priority />
        <LoginForm />
      </section>
    </div>
  );
}
