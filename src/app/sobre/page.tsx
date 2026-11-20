import Link from "next/link";
import { Icon } from "../(app)/ui";

export const metadata = {
  title: "Sobre · Nexo",
  description: "Do CNIS aos cenários de aposentadoria da EC 103/2019, com a origem de cada número. Conheça o Nexo e os planos.",
};

const DORES = [
  { t: "PDF, planilha, calculadora", d: "O advogado copia vínculo por vínculo do CNIS para uma planilha e depois para a calculadora. Cada cópia é uma chance de errar." },
  { t: "O CNIS vem incompleto", d: "Vínculos sem data de fim, indicadores como PEXT e PREC-MENOR-MIN, lacunas e períodos sobrepostos." },
  { t: "Cinco regras que mudam todo ano", d: "A EC 103/2019 trouxe quatro regras de transição e uma permanente, com idade e pontos que sobem a cada ano. Um erro calado vira orientação errada para o cliente." },
];

const ETAPAS = [
  { t: "Extração", d: "Lê o PDF do CNIS e monta a linha do tempo. Cada campo guarda a página e a linha de onde veio." },
  { t: "Cálculo", d: "Avalia as cinco regras lado a lado: se o cliente já pode se aposentar, o que falta e a data prevista." },
  { t: "Justificativa", d: "Cada número abre a sua trilha: o trecho do CNIS, a regra aplicada e a versão da regra." },
];

const RISCOS = [
  { t: "Avisa quando não sabe", d: "Item duvidoso vira REVISAR, e todo texto não lido aparece na tela. No exemplo sintético: 100% dos vínculos e competências, nenhum erro silencioso." },
  { t: "Regras versionadas", d: "Os parâmetros legais são dados com vigência. Um cálculo antigo é reexecutado e dá exatamente o mesmo resultado." },
  { t: "Sem IA na extração", d: "A leitura é determinística: o mesmo PDF gera sempre a mesma linha do tempo, e dá para explicar cada valor." },
  { t: "Privacidade", d: "A versão pública só usa CNIS sintético. CPF, NIT e nomes nunca vão para os logs." },
];

const PLANOS = [
  {
    nome: "Essencial",
    preco: 79,
    para: "Para quem está começando no previdenciário.",
    itens: ["1 advogado", "Até 20 análises de CNIS por mês", "Linha do tempo revisável, com histórico de edições", "As 5 regras da EC 103/2019 com a trilha de cada número", "Relatório para imprimir"],
  },
  {
    nome: "Pro",
    preco: 149,
    destaque: true,
    para: "Para quem atende vários clientes por mês e planeja aposentadorias.",
    itens: ["Tudo do Essencial", "Análises ilimitadas", "Planejamento: “e se o cliente parar de contribuir?”", "Estimativa de RMI e minuta de petição", "Checklist de conferência e lista de documentos para o cliente", "Alertas de aposentadoria no painel"],
  },
  {
    nome: "Escritório",
    preco: 349,
    para: "Para escritórios com equipe e processos em andamento.",
    itens: ["Tudo do Pro", "Quadro de processos com sincronização diária do Jusbrasil", "Até 200 processos acompanhados", "Suporte prioritário"],
    emBreve: ["Até 5 advogados"],
  },
];

function Cards({ items, numbered = false }: { items: { t: string; d: string }[]; numbered?: boolean }) {
  return (
    <div className="pitch-grid">
      {items.map((it, i) => (
        <div key={it.t} className="card card-body">
          {numbered && <span className="pitch-step" aria-hidden="true">{i + 1}</span>}
          <h3>{it.t}</h3>
          <p className="muted">{it.d}</p>
        </div>
      ))}
    </div>
  );
}

function Heading({ id, eyebrow, title, accent }: { id: string; eyebrow: string; title: string; accent: string }) {
  return (
    <div className="stack">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className="pitch-title">{title} <em>{accent}</em></h2>
      <span className="pitch-rule" aria-hidden="true" />
    </div>
  );
}

export default function SobrePage() {
  return (
    <div className="pitch">
      <header className="pitch-hero">
        <nav className="row-between" aria-label="Nexo">
          <span className="mark">✱ NEXO</span>
          <div className="row">
            <a href="#planos" className="button button-outline-light button-sm">Planos</a>
            <Link href="/login" className="button button-light button-sm">Entrar</Link>
          </div>
        </nav>
        <h1 className="display">
          Nexo
          <em>do CNIS à petição.</em>
        </h1>
        <p className="pitch-lead">Do extrato do INSS aos cenários de aposentadoria da EC 103/2019, com a origem de cada número. Feito para advogados previdenciários.</p>
        <div className="row">
          <Link href="/login" className="button button-light">Entrar <Icon name="arrow" /></Link>
          <a href="#planos" className="button button-outline-light">Ver planos</a>
        </div>
      </header>

      <main>
        <section className="pitch-section" aria-labelledby="dor">
          <Heading id="dor" eyebrow="A dor" title="Hoje o cálculo é feito" accent="à mão." />
          <Cards items={DORES} />
        </section>

        <section className="pitch-section" aria-labelledby="solucao">
          <Heading id="solucao" eyebrow="A solução" title="Uma cadeia" accent="auditável." />
          <Cards items={ETAPAS} numbered />
        </section>

        <section className="pitch-section" aria-labelledby="riscos">
          <Heading id="riscos" eyebrow="Como reduzimos riscos" title="Errar calado" accent="não é opção." />
          <Cards items={RISCOS} />
        </section>

        <section id="planos" className="pitch-section" aria-labelledby="planos-titulo">
          <Heading id="planos-titulo" eyebrow="Planos" title="Do advogado solo" accent="ao escritório." />
          <p className="notice"><Icon name="info" /> Valores ilustrativos: o Nexo é um MVP acadêmico e não faz cobrança.</p>
          <div className="pitch-grid">
            {PLANOS.map((p) => (
              <article key={p.nome} className={`card plan${p.destaque ? " is-featured" : ""}`} aria-labelledby={`plano-${p.nome}`}>
                <div className="card-body">
                  <div className="row-between">
                    <h3 id={`plano-${p.nome}`} className="plan-name">{p.nome}</h3>
                    {p.destaque && <span className="badge tone-danger">Mais indicado</span>}
                  </div>
                  <p className="muted">{p.para}</p>
                  <p className="plan-price"><strong>R$ {p.preco}</strong> <span>/mês</span></p>
                  <ul className="checklist">
                    {p.itens.map((item) => (
                      <li key={item}><span className="ic-ok"><Icon name="check" /></span> {item}</li>
                    ))}
                    {p.emBreve?.map((item) => (
                      <li key={item}><span className="muted"><Icon name="clock" /></span> <span>{item} <span className="badge">em breve</span></span></li>
                    ))}
                  </ul>
                  <Link href="/login" className={`button button-block${p.destaque ? "" : " button-secondary"}`}>Testar a demonstração</Link>
                </div>
              </article>
            ))}
          </div>
          <p className="small muted">Referência de mercado: calculadoras previdenciárias custam de R$ 72 a R$ 150 por mês; softwares de gestão com acompanhamento de processos partem de cerca de R$ 250.</p>
        </section>
      </main>

      <footer className="pitch-foot">
        <span className="mark">✱ NEXO</span>
        <span>MVP acadêmico · ACH2008 · EACH/USP. Não é aconselhamento jurídico.</span>
      </footer>
    </div>
  );
}
