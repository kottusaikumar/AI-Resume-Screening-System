import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Braces,
  FileSearch,
  Github,
  Radar,
  Scale,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import {
  ABOUT_STRUCTURED_DATA,
  GITHUB_ISSUES_URL,
  GITHUB_URL,
  OG_IMAGE_URL,
  SITE_URL,
} from "@/lib/site-metadata";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About NeuralRecruit - Project and Responsible Use" },
      {
        name: "description",
        content:
          "Learn how NeuralRecruit provides explainable resume intelligence, how its source-available architecture works, and which responsible-use safeguards apply.",
      },
      { property: "og:title", content: "About NeuralRecruit" },
      {
        property: "og:description",
        content:
          "Project information, source-available architecture, and responsible-use safeguards for NeuralRecruit.",
      },
      { property: "og:url", content: `${SITE_URL}/about` },
      { property: "og:image", content: OG_IMAGE_URL },
      { "script:ld+json": ABOUT_STRUCTURED_DATA },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/about` }],
  }),
  component: AboutPage,
});

const PRINCIPLES = [
  {
    icon: FileSearch,
    title: "Evidence before conclusions",
    body: "NeuralRecruit exposes detected skills, section coverage, and scoring components so reviewers can inspect the basis of every result.",
  },
  {
    icon: ShieldCheck,
    title: "Temporary document processing",
    body: "The public showcase processes candidate files temporarily and does not require a paid or external LLM inference API.",
  },
  {
    icon: Scale,
    title: "Human review is mandatory",
    body: "Scores are advisory decision-support signals. They are not hiring decisions or predictions of a candidate's future performance.",
  },
] as const;

function AboutPage() {
  return (
    <main className="landing-shell project-page">
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
        <nav className="landing-nav-links" aria-label="Project navigation">
          <a href="#purpose">Purpose</a>
          <a href="#architecture">Architecture</a>
          <a href="#responsible-use">Responsible use</a>
        </nav>
        <Link to="/" className="project-back-link">
          <ArrowLeft aria-hidden="true" />
          Back to showcase
        </Link>
      </header>

      <article className="project-main">
        <header className="project-hero" id="purpose">
          <div className="landing-eyebrow">
            <span aria-hidden="true" />
            Source-available HR decision support
          </div>
          <h1>
            About <span>NeuralRecruit.</span>
          </h1>
          <p>
            NeuralRecruit is a source-available web application for HR teams and technical
            recruiters. It turns resumes into structured, reviewable evidence and adds
            job-description matching only when the hiring question requires it.
          </p>
          <div className="project-actions">
            <Link to="/" className="landing-primary-cta">
              Open the showcase
              <ArrowRight aria-hidden="true" />
            </Link>
            <a href={GITHUB_URL} className="landing-secondary-cta">
              <Github aria-hidden="true" />
              View source
            </a>
          </div>
          <p className="project-updated">
            Project information reviewed <time dateTime="2026-07-31">July 31, 2026</time>
          </p>
        </header>

        <section className="project-section" id="architecture" aria-labelledby="architecture-title">
          <div className="project-section-heading">
            <span>Inspectable by design</span>
            <h2 id="architecture-title">A transparent technical pipeline.</h2>
            <p>
              The application combines deterministic parsing, an IT skill taxonomy, local retrieval,
              and evidence-oriented scoring. The public deployment uses a React and TypeScript
              frontend with a FastAPI analysis service.
            </p>
          </div>
          <div className="project-architecture-grid">
            <article>
              <Braces aria-hidden="true" />
              <h3>Web application</h3>
              <p>React, TypeScript, TanStack Start, browser PDF extraction, and optional OCR.</p>
            </article>
            <article>
              <ServerCog aria-hidden="true" />
              <h3>Analysis service</h3>
              <p>FastAPI, TF-IDF/LSA, BM25, rule-based NLP, and an IT-focused skill taxonomy.</p>
            </article>
            <article>
              <FileSearch aria-hidden="true" />
              <h3>Review output</h3>
              <p>Resume health, evidence signals, role suggestions, and job-alignment reports.</p>
            </article>
          </div>
        </section>

        <section
          className="project-section project-responsible"
          id="responsible-use"
          aria-labelledby="responsible-title"
        >
          <div className="project-section-heading">
            <span>Responsible use</span>
            <h2 id="responsible-title">Support the reviewer. Never replace them.</h2>
          </div>
          <div className="project-principle-grid">
            {PRINCIPLES.map((principle) => (
              <article key={principle.title}>
                <principle.icon aria-hidden="true" />
                <div>
                  <h3>{principle.title}</h3>
                  <p>{principle.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="project-source" aria-labelledby="source-title">
          <div>
            <span>Source and feedback</span>
            <h2 id="source-title">Review the implementation.</h2>
            <p>
              The complete project is public on GitHub. Use GitHub Issues for technical questions,
              reproducible bugs, or responsible feedback.
            </p>
          </div>
          <div className="project-source-actions">
            <a href={GITHUB_URL}>
              <Github aria-hidden="true" />
              GitHub repository
            </a>
            <a href={GITHUB_ISSUES_URL}>
              Open an issue
              <ArrowRight aria-hidden="true" />
            </a>
          </div>
        </section>
      </article>

      <footer className="landing-footer project-footer">
        <Link to="/" className="landing-brand" aria-label="NeuralRecruit home">
          <span className="landing-brand-mark">
            <Radar aria-hidden="true" />
          </span>
          <span>
            <strong>NeuralRecruit</strong>
            <small>HR decision-support showcase</small>
          </span>
        </Link>
        <p>Source-available resume intelligence with mandatory human review.</p>
        <div className="landing-footer-links">
          <Link to="/">Showcase</Link>
          <a href={GITHUB_URL}>Source</a>
          <a href={GITHUB_ISSUES_URL}>Feedback</a>
        </div>
      </footer>
    </main>
  );
}
