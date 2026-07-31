import { createFileRoute } from "@tanstack/react-router";
import { FileSearch, ServerCog, ShieldCheck } from "lucide-react";
import { PublicInfoPage, type PublicInfoSection } from "@/components/public-info-page";
import { ABOUT_STRUCTURED_DATA, OG_IMAGE_URL, SITE_URL } from "@/lib/site-metadata";

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

const SECTIONS: readonly PublicInfoSection[] = [
  {
    id: "purpose",
    label: "Project purpose",
    title: "Evidence-led support for technical hiring.",
    body: "NeuralRecruit helps HR teams and technical recruiters turn resumes into structured evidence. Job-description matching appears only when the hiring question requires it.",
    icon: FileSearch,
    items: [
      {
        title: "Resume intelligence",
        description:
          "Inspect document quality, sections, skills, experience evidence, improvements, and suitable IT role families without supplying a job description.",
      },
      {
        title: "Optional job context",
        description:
          "Add a job description for one-to-one matching, candidate ranking, or role comparison while keeping supporting evidence visible.",
      },
      {
        title: "Public showcase",
        description:
          "Explore the core workflows without creating an account. Candidate files are processed temporarily and scan history is disabled.",
      },
      {
        title: "Source available",
        description:
          "The implementation is published on GitHub so reviewers can inspect the architecture, scoring path, safeguards, and documented limitations.",
      },
    ],
  },
  {
    id: "architecture",
    label: "Inspectable architecture",
    title: "A transparent technical pipeline.",
    body: "The system separates document extraction, terminology normalization, evidence comparison, and report presentation so important findings can be checked rather than merely accepted.",
    icon: ServerCog,
    items: [
      {
        title: "Web application",
        description:
          "React, TypeScript, TanStack Start, browser PDF extraction, and bounded optional OCR provide the interactive experience.",
      },
      {
        title: "Analysis service",
        description:
          "FastAPI, TF-IDF and LSA, BM25, rule-based NLP, and a curated IT taxonomy power the evidence-processing path.",
      },
      {
        title: "Review output",
        description:
          "Reports separate resume health, skill evidence, experience interpretation, role suggestions, and job alignment.",
      },
      {
        title: "Deployment boundaries",
        description:
          "Vercel serves the frontend and Render hosts the analysis API. The public scoring path does not require a paid external LLM API.",
      },
    ],
  },
  {
    id: "responsible-use",
    label: "Project principles",
    title: "Built to assist—not decide.",
    body: "Hiring is consequential. NeuralRecruit organizes job-related evidence for a responsible human reviewer and clearly limits what its scores can mean.",
    icon: ShieldCheck,
    items: [
      {
        title: "Evidence before conclusions",
        description:
          "Detected skills, section context, experience findings, and scoring components stay visible for source verification.",
      },
      {
        title: "Temporary processing",
        description:
          "The public showcase removes temporary uploads after extraction and does not persist candidate reports to scan history.",
      },
      {
        title: "Human review is mandatory",
        description:
          "Scores are advisory decision-support signals, not hiring decisions or predictions of future job performance.",
      },
      {
        title: "Questions are welcome",
        description:
          "The public issue tracker provides a direct place to report reproducible bugs, parsing concerns, and responsible-use feedback.",
      },
    ],
  },
] as const;

function AboutPage() {
  return (
    <PublicInfoPage
      eyebrow="Source-available HR decision support"
      title="About"
      accent="NeuralRecruit."
      intro="NeuralRecruit turns resumes into structured, reviewable evidence and adds job-description matching only when the hiring question requires it. It is designed for transparent technical recruiting—not automated employment decisions."
      highlights={[
        { label: "Purpose", value: "Explainable HR decision support" },
        { label: "Architecture", value: "Source available and inspectable" },
        { label: "Responsibility", value: "Mandatory human review" },
      ]}
      sections={SECTIONS}
      closing={{
        label: "Explore the product",
        title: "Choose the right review workflow.",
        body: "See how resume-only review, job matching, candidate ranking, and role comparison answer different technical hiring questions.",
        primaryLabel: "Explore features",
        primaryTo: "/features",
      }}
    />
  );
}
