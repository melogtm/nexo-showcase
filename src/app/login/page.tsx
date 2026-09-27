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
        <p className="rule">Um fluxo único para o trabalho previdenciário</p>
      </section>
      <section className="login-panel">
        <Image src="/nexo-logo.png" alt="Nexo" width={96} height={107} priority />
        <LoginForm />
      </section>
    </div>
  );
}
