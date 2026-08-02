import {
  ArrowRight,
  Blocks,
  Braces,
  CloudCog,
  Check,
  Database,
  FileSearch,
  Gauge,
  Network,
  Radar,
  ScanLine,
  ServerCog,
  ShieldCheck,
  Sparkles,
  TestTube2,
} from "lucide-react";
import { GITHUB_ISSUES_URL, GITHUB_URL } from "@/lib/site-metadata";

const WORKFLOW = [
  {
    number: "01",
    title: "Review a resume on its own",
    description:
      "Inspect ATS readability, structure, skills, experience evidence, and suitable role families without requiring a JD.",
  },
  {
    number: "02",
    title: "Add hiring context when needed",
    description:
      "Switch to Job Match to compare one candidate with a role using transparent, weighted scoring signals.",
  },
  {
    number: "03",
    title: "Make the human decision",
    description:
      "Use the evidence and recommendations as decision support—not an automatic hiring verdict.",
  },
] as const;

const SIGNALS = [
  { title: "Document quality", detail: "ATS readability verified", state: "complete", icon: Check },
  {
    title: "Profile structure",
    detail: "Core sections detected",
    state: "complete",
    icon: FileSearch,
  },
  {
    title: "Skill intelligence",
    detail: "Reading candidate evidence",
    state: "active",
    icon: ScanLine,
  },
  { title: "Role suggestions", detail: "Evidence-backed only", state: "", icon: Gauge },
] as const;

const ROLE_GROUPS = [
  {
    icon: Braces,
    title: "Software engineering",
    roles: "Frontend, Backend, Full Stack, Java, Python, Platform",
  },
  {
    icon: Database,
    title: "Data and AI",
    roles: "Data Analyst, Data Engineer, Data Scientist, AI and ML Engineer",
  },
  {
    icon: CloudCog,
    title: "Cloud and operations",
    roles: "Cloud, DevOps, SRE, Systems and Infrastructure",
  },
  {
    icon: ShieldCheck,
    title: "Security and networks",
    roles: "Cybersecurity, Network Engineering and Security Operations",
  },
  {
    icon: TestTube2,
    title: "Quality engineering",
    roles: "QA Engineer, SDET, Automation and Performance Testing",
  },
  {
    icon: Network,
    title: "IT services",
    roles: "IT Support, Systems Support and Technical Operations",
  },
] as const;

const FAQ = [
  {
    question: "Does NeuralRecruit make hiring decisions?",
    answer:
      "No. It organizes resume evidence and role alignment for human review. It never automatically hires or rejects a candidate.",
  },
  {
    question: "What does the alignment index mean?",
    answer:
      "It is a transparent evidence-alignment indicator derived from lexical, semantic, skill-context, and experience signals. It is not a probability of job success.",
  },
  {
    question: "Does it send resumes to an external AI API?",
    answer:
      "No. NeuralRecruit has zero LLM API cost. Resume analysis uses explainable algorithms, rule-based logic, statistical retrieval, and a curated IT taxonomy without sending candidate text to an external LLM.",
  },
  {
    question: "Can it review a resume without a job description?",
    answer:
      "Yes. Resume Review checks parseability, structure, skills, experience evidence, and suitable IT role families without inventing a job-match score.",
  },
] as const;

export function ShowcaseLanding({ onEnter }: { onEnter: () => void }) {
  return (
    <main id="top" className="landing-shell">
      <a className="landing-skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="landing-ambient landing-ambient-one" aria-hidden="true" />
      <div className="landing-ambient landing-ambient-two" aria-hidden="true" />

      <header className="landing-nav">
        <a href="#top" className="landing-brand" aria-label="NeuralRecruit home">
          <span className="landing-brand-mark">
            <Radar aria-hidden="true" />
          </span>
          <span>
            <strong>NeuralRecruit</strong>
            <small>Evidence-led hiring intelligence</small>
          </span>
        </a>
        <nav className="landing-nav-links" aria-label="Primary navigation">
          <a href="/features">Features</a>
          <a href="/methodology">Methodology</a>
          <a href="/safeguards">Safeguards</a>
          <a href="/about">About</a>
        </nav>
        <button className="landing-signin-link" type="button" onClick={onEnter}>
          Enter showcase
          <ArrowRight aria-hidden="true" />
        </button>
      </header>

      <section id="main-content" className="landing-hero" tabIndex={-1}>
        <div className="landing-hero-copy">
          <div className="landing-eyebrow">
            <span aria-hidden="true" />
            Public HR showcase · No account required
          </div>
          <h1>
            Understand every resume.
            <span>Decide with evidence.</span>
          </h1>
          <p className="landing-hero-lede">
            NeuralRecruit is a source-available web application for HR teams and technical
            recruiters. It turns candidate resumes into structured, reviewable intelligence, then
            adds job-description matching only when needed. It uses explainable algorithms and
            rule-based logic with zero LLM API cost.
          </p>
          <div className="landing-actions">
            <button type="button" className="landing-primary-cta" onClick={onEnter}>
              Open Resume Review
              <ArrowRight aria-hidden="true" />
            </button>
            <a className="landing-secondary-cta" href="#workflow">
              See how it works
            </a>
          </div>
          <div className="landing-proof-row" aria-label="Product principles">
            <span>
              <ShieldCheck /> Temporary processing
            </span>
            <span>
              <FileSearch /> Explainable evidence
            </span>
            <span>
              <Check /> Human review required
            </span>
          </div>
        </div>

        <div className="landing-product-stage" aria-label="NeuralRecruit product preview">
          <div className="landing-preview-glow" aria-hidden="true" />
          <div className="landing-preview-window">
            <div className="landing-preview-topbar">
              <div className="landing-preview-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="landing-preview-status">
                <i aria-hidden="true" />
                Resume intelligence
              </div>
              <div className="landing-preview-private">
                <ShieldCheck />
                Private
              </div>
            </div>
            <div className="landing-preview-body">
              <div className="landing-scan-panel">
                <div className="landing-scan-label">
                  Candidate profile <strong>Live reading</strong>
                </div>
                <div className="landing-document">
                  <i className="landing-scan-corner landing-scan-tl" />
                  <i className="landing-scan-corner landing-scan-tr" />
                  <i className="landing-scan-corner landing-scan-bl" />
                  <i className="landing-scan-corner landing-scan-br" />
                  <span className="landing-scan-beam" aria-hidden="true" />
                  <div className="landing-avatar-skeleton" />
                  <div className="landing-document-lines">
                    <span className="is-long" />
                    <span />
                    <span className="is-short" />
                  </div>
                  <div className="landing-document-section">
                    <small>Experience evidence</small>
                    <span />
                    <span />
                  </div>
                  <div className="landing-document-section">
                    <small>Detected skills</small>
                    <div className="landing-skill-pills">
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                </div>
              </div>
              <div className="landing-signal-panel">
                <div className="landing-signal-heading">
                  <div>
                    <small>Resume review</small>
                    <strong>Evidence map</strong>
                  </div>
                  <span>77%</span>
                </div>
                <div className="landing-signal-list">
                  {SIGNALS.map((signal) => (
                    <div
                      key={signal.title}
                      className={`landing-signal ${signal.state ? `is-${signal.state}` : ""}`}
                    >
                      <span className="landing-signal-icon">
                        <signal.icon aria-hidden="true" />
                      </span>
                      <span>
                        <strong>{signal.title}</strong>
                        <small>{signal.detail}</small>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="landing-review-note">
                  <ShieldCheck aria-hidden="true" />
                  <span>
                    <strong>Quality score, not a hiring score.</strong>
                    Resume-only review never invents job fit without a job description.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-principles" aria-label="Platform capabilities">
        <div>
          <strong>2</strong>
          <span>resume review and job match modes</span>
        </div>
        <div>
          <strong>7</strong>
          <span>transparent matching signals</span>
        </div>
        <div>
          <strong>0</strong>
          <span>LLM API cost</span>
        </div>
      </section>

      <section className="landing-section landing-modes" aria-labelledby="modes-title">
        <div className="landing-section-heading">
          <span>Purpose-built for technical hiring</span>
          <h2 id="modes-title">Four focused ways to review IT talent.</h2>
          <p>
            Start with a single document or move into desktop comparison workflows. Mobile keeps the
            two essential review modes clear and fast.
          </p>
        </div>
        <div className="landing-mode-grid">
          <article>
            <FileSearch />
            <span>Mobile + desktop</span>
            <h3>Resume Review</h3>
            <p>Inspect ATS readability, structure, experience evidence, and detected skills.</p>
          </article>
          <article>
            <Gauge />
            <span>Mobile + desktop</span>
            <h3>Resume to Job</h3>
            <p>Compare one resume with one JD using evidence-alignment signals.</p>
          </article>
          <article>
            <Blocks />
            <span>Desktop workspace</span>
            <h3>Rank Candidates</h3>
            <p>Compare multiple resumes against the same calibrated role criteria.</p>
          </article>
          <article>
            <ScanLine />
            <span>Desktop workspace</span>
            <h3>Compare Roles</h3>
            <p>Find which of several job descriptions has the strongest resume evidence.</p>
          </article>
        </div>
      </section>

      <section id="workflow" className="landing-section">
        <div className="landing-section-heading">
          <span>From document to decision</span>
          <h2>A calmer way to understand candidates.</h2>
          <p>
            Start with the resume itself. Add role context only when the hiring question requires
            it, and keep every recommendation open to human review.
          </p>
        </div>
        <div className="landing-workflow-grid">
          {WORKFLOW.map((item) => (
            <article key={item.number}>
              <span>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="safeguards" className="landing-section landing-safeguards">
        <div className="landing-safeguard-copy">
          <span>Built for responsible screening</span>
          <h2>Useful signal without the black box.</h2>
          <p>
            NeuralRecruit supports HR teams with structured evidence. It does not replace
            interviews, references, or professional judgment.
          </p>
          <button type="button" onClick={onEnter}>
            Enter HR showcase
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
        <div className="landing-safeguard-list">
          <div>
            <ShieldCheck />
            <span>
              <strong>Privacy-aware processing</strong>
              Candidate files are processed temporarily for text extraction.
            </span>
          </div>
          <div>
            <Sparkles />
            <span>
              <strong>No fabricated job fit</strong>
              Resume Review reports document quality without pretending to know role alignment.
            </span>
          </div>
          <div>
            <Gauge />
            <span>
              <strong>Evidence before score</strong>
              Skills, sections, and matching signals remain visible and reviewable.
            </span>
          </div>
        </div>
      </section>

      <section className="landing-section landing-role-section" id="roles">
        <div className="landing-section-heading">
          <span>Deliberately specialized</span>
          <h2>Built for IT roles—not generic hiring.</h2>
          <p>
            A focused technical ontology keeps programming languages, frameworks, cloud services,
            infrastructure tools, testing platforms, and security capabilities in context.
          </p>
        </div>
        <div className="landing-role-grid">
          {ROLE_GROUPS.map((group) => (
            <article key={group.title}>
              <group.icon aria-hidden="true" />
              <div>
                <h3>{group.title}</h3>
                <p>{group.roles}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-architecture" id="architecture">
        <div className="landing-architecture-copy">
          <span>Open-source architecture</span>
          <h2>Private processing with inspectable signals.</h2>
          <p>
            NeuralRecruit uses deterministic parsing, an IT skill taxonomy, local vector retrieval,
            lexical retrieval, and evidence-oriented scoring. No external LLM API sits between the
            resume and the report, so the analysis has zero LLM API cost.
          </p>
          <div className="landing-stack-list">
            <span>React + TypeScript</span>
            <span>FastAPI</span>
            <span>Local TF-IDF + LSA</span>
            <span>BM25</span>
            <span>Rule-based NLP</span>
            <span>Local OCR</span>
          </div>
        </div>
        <div className="landing-architecture-flow" aria-label="Processing architecture">
          {[
            ["01", "Secure upload", "Validate document type and limits"],
            ["02", "Parse evidence", "Read sections, roles, skills, and dates"],
            ["03", "Normalize IT skills", "Resolve aliases and technical context"],
            ["04", "Compare signals", "Lexical, semantic, skill, and experience"],
            ["05", "Explain", "Show evidence, uncertainty, and human-review status"],
          ].map(([number, title, detail]) => (
            <div key={number}>
              <strong>{number}</strong>
              <span>
                <b>{title}</b>
                <small>{detail}</small>
              </span>
              {number !== "05" && <ArrowRight aria-hidden="true" />}
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section landing-faq" id="faq">
        <div className="landing-section-heading">
          <span>Clear by design</span>
          <h2>Questions responsible teams ask first.</h2>
        </div>
        <div className="landing-faq-grid">
          {FAQ.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <a href="#top" className="landing-brand" aria-label="NeuralRecruit home">
          <span className="landing-brand-mark">
            <Radar aria-hidden="true" />
          </span>
          <span>
            <strong>NeuralRecruit</strong>
            <small>HR decision support showcase</small>
          </span>
        </a>
        <p>Explainable resume intelligence with mandatory human review.</p>
        <div className="landing-footer-links">
          <a href="/about">About</a>
          <a href="/features">Features</a>
          <a href="/methodology">Methodology</a>
          <a href="/safeguards">Safeguards</a>
          <a href="/privacy">Privacy</a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            Source
          </a>
          <a href={GITHUB_ISSUES_URL} target="_blank" rel="noopener noreferrer">
            Feedback
          </a>
          <button type="button" onClick={onEnter}>
            Open showcase
          </button>
        </div>
      </footer>
    </main>
  );
}
