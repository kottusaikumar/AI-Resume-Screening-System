import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Github, Radar, type LucideIcon } from "lucide-react";
import { GITHUB_ISSUES_URL, GITHUB_URL } from "@/lib/site-metadata";

export type PublicInfoSection = {
  id: string;
  label: string;
  title: string;
  body: string;
  icon: LucideIcon;
  items: readonly {
    title: string;
    description: string;
  }[];
};

type PublicInfoPageProps = {
  eyebrow: string;
  title: string;
  accent: string;
  intro: string;
  highlights: readonly {
    label: string;
    value: string;
  }[];
  sections: readonly PublicInfoSection[];
  closing: {
    label: string;
    title: string;
    body: string;
    primaryLabel: string;
    primaryTo: "/" | "/features" | "/methodology" | "/safeguards" | "/privacy";
  };
};

const PUBLIC_LINKS = [
  { to: "/about", label: "About" },
  { to: "/features", label: "Features" },
  { to: "/methodology", label: "Methodology" },
  { to: "/safeguards", label: "Safeguards" },
  { to: "/privacy", label: "Privacy" },
] as const;

export function PublicInfoPage({
  eyebrow,
  title,
  accent,
  intro,
  highlights,
  sections,
  closing,
}: PublicInfoPageProps) {
  const currentPath = useRouterState({ select: (state) => state.location.pathname });

  return (
    <main className="landing-shell project-page knowledge-page">
      <a className="landing-skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="landing-ambient landing-ambient-one" aria-hidden="true" />

      <header className="landing-nav">
        <Link to="/" className="landing-brand" aria-label="NeuralRecruit home">
          <span className="landing-brand-mark">
            <Radar aria-hidden="true" />
          </span>
          <span>
            <strong>NeuralRecruit</strong>
            <small>Evidence-led hiring intelligence</small>
          </span>
        </Link>
        <nav className="landing-nav-links" aria-label="Public information">
          {PUBLIC_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={currentPath === link.to ? "is-active" : undefined}
              aria-current={currentPath === link.to ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <Link to="/" className="project-back-link">
          <ArrowLeft aria-hidden="true" />
          Back to showcase
        </Link>
      </header>

      <article id="main-content" className="project-main" tabIndex={-1}>
        <header className="project-hero knowledge-hero">
          <div className="knowledge-hero-copy">
            <div className="landing-eyebrow">
              <span aria-hidden="true" />
              {eyebrow}
            </div>
            <h1>
              {title} <span>{accent}</span>
            </h1>
            <p>{intro}</p>
            <p className="project-updated">
              Page reviewed <time dateTime="2026-07-31">July 31, 2026</time>
            </p>
          </div>
          <aside className="knowledge-hero-summary" aria-label="Page summary">
            <div className="knowledge-summary-heading">
              <span>At a glance</span>
              <strong>{String(highlights.length).padStart(2, "0")} key points</strong>
            </div>
            <dl>
              {highlights.map((highlight, index) => (
                <div key={highlight.label}>
                  <dt>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {highlight.label}
                  </dt>
                  <dd>{highlight.value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </header>

        <nav className="knowledge-page-index" aria-label="On this page">
          <span>On this page</span>
          {sections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.label}
            </a>
          ))}
        </nav>

        {sections.map((section) => (
          <section
            className="project-section knowledge-section"
            key={section.title}
            id={section.id}
            aria-labelledby={`${section.id}-title`}
          >
            <div className="project-section-heading">
              <span>{section.label}</span>
              <h2 id={`${section.id}-title`}>{section.title}</h2>
              <p>{section.body}</p>
            </div>
            <ol className="knowledge-card-grid">
              {section.items.map((item, index) => (
                <li key={item.title}>
                  <div className="knowledge-card-topline">
                    <section.icon aria-hidden="true" />
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </li>
              ))}
            </ol>
          </section>
        ))}

        <section className="project-source knowledge-closing" aria-labelledby="next-step-title">
          <div>
            <span>{closing.label}</span>
            <h2 id="next-step-title">{closing.title}</h2>
            <p>{closing.body}</p>
          </div>
          <div className="project-source-actions">
            <Link to={closing.primaryTo}>
              {closing.primaryLabel}
              <ArrowRight aria-hidden="true" />
            </Link>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <Github aria-hidden="true" />
              Review source
            </a>
          </div>
        </section>
      </article>

      <footer className="landing-footer project-footer knowledge-footer">
        <Link to="/" className="landing-brand" aria-label="NeuralRecruit home">
          <span className="landing-brand-mark">
            <Radar aria-hidden="true" />
          </span>
          <span>
            <strong>NeuralRecruit</strong>
            <small>HR decision-support showcase</small>
          </span>
        </Link>
        <p>Transparent evidence, documented limits, and mandatory human review.</p>
        <div className="landing-footer-links">
          {PUBLIC_LINKS.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
          <a href={GITHUB_ISSUES_URL} target="_blank" rel="noopener noreferrer">
            Feedback
          </a>
        </div>
      </footer>
    </main>
  );
}
