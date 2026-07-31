import { createFileRoute } from "@tanstack/react-router";
import { Binary, Scale, Waypoints } from "lucide-react";
import { PublicInfoPage, type PublicInfoSection } from "@/components/public-info-page";
import { createPublicPageStructuredData, OG_IMAGE_URL, SITE_URL } from "@/lib/site-metadata";

const DESCRIPTION =
  "Understand how NeuralRecruit parses resumes, identifies IT skills, estimates experience, compares job evidence, and communicates scoring limitations.";

const STRUCTURED_DATA = createPublicPageStructuredData({
  path: "methodology",
  name: "NeuralRecruit Methodology",
  description: DESCRIPTION,
});

export const Route = createFileRoute("/methodology")({
  head: () => ({
    meta: [
      { title: "NeuralRecruit Methodology - Explainable Evidence Scoring" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "NeuralRecruit Methodology" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/methodology` },
      { property: "og:image", content: OG_IMAGE_URL },
      { "script:ld+json": STRUCTURED_DATA },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/methodology` }],
  }),
  component: MethodologyPage,
});

const SECTIONS: readonly PublicInfoSection[] = [
  {
    id: "pipeline",
    label: "Evidence pipeline",
    title: "From document to reviewable signals.",
    body: "The pipeline keeps extraction, normalization, comparison, and presentation separate. This makes incorrect evidence easier to identify and prevents a single opaque score from replacing judgment.",
    icon: Waypoints,
    items: [
      {
        title: "Validate and extract",
        description:
          "Uploaded PDF, DOCX, or TXT files are checked against type and size limits. Searchable text is extracted first; scanned PDFs can use bounded browser OCR.",
      },
      {
        title: "Identify sections",
        description:
          "Rule-based parsing locates summary, experience, education, skills, projects, and certifications while preserving section context for evidence reporting.",
      },
      {
        title: "Normalize IT terminology",
        description:
          "A curated taxonomy resolves aliases and related technical concepts across software, data, AI, cloud, security, networking, QA, support, and enterprise systems.",
      },
      {
        title: "Assemble the report",
        description:
          "Individual signals, evidence locations, missing requirements, experience findings, and document-quality measures remain visible to the reviewer.",
      },
    ],
  },
  {
    id: "alignment",
    label: "Job alignment",
    title: "Multiple signals, one explainable index.",
    body: "Job-aware analysis combines complementary retrieval and evidence checks. Required skills receive stronger emphasis than preferred skills, and document quality remains distinct from technical fit.",
    icon: Binary,
    items: [
      {
        title: "Technical similarity",
        description:
          "TF-IDF and local latent-semantic analysis compare the resume and job description without calling an external generative model.",
      },
      {
        title: "Keyword retrieval",
        description:
          "BM25 rewards relevant job-language evidence while reducing the influence of very common terms and raw keyword repetition.",
      },
      {
        title: "Skill and context coverage",
        description:
          "The system checks whether required technical concepts appear and records where the supporting evidence was found.",
      },
      {
        title: "Experience calibration",
        description:
          "Job requirements such as fresher, ranges, minimum years, and seniority language are interpreted separately from the candidate's dated work history.",
      },
    ],
  },
  {
    id: "interpretation",
    label: "Interpretation",
    title: "What the result does—and does not—mean.",
    body: "The alignment index is a retrieval and evidence indicator. It is not a probability of job success, a measure of human potential, or a lawful basis for an automated employment decision.",
    icon: Scale,
    items: [
      {
        title: "Evidence can be incomplete",
        description:
          "A missing term may reflect resume wording rather than missing ability. Reviewers should probe important gaps instead of treating them as automatic disqualifiers.",
      },
      {
        title: "Scores are role-specific",
        description:
          "A strong result for one job description does not imply universal candidate quality, and scores from materially different roles should not be compared directly.",
      },
      {
        title: "Formatting affects extraction",
        description:
          "Complex layouts, image-only documents, unusual headings, and OCR errors can reduce extraction quality. The source resume should always remain available for verification.",
      },
      {
        title: "Validation is ongoing",
        description:
          "Taxonomy coverage and parsing rules require representative testing across role families, resume formats, languages, seniority levels, and employment patterns.",
      },
    ],
  },
] as const;

function MethodologyPage() {
  return (
    <PublicInfoPage
      eyebrow="Explainable methodology"
      title="Trace every signal back to"
      accent="candidate evidence."
      intro="NeuralRecruit combines deterministic parsing, an IT-focused taxonomy, lexical retrieval, local statistical similarity, experience interpretation, and resume-quality checks. The output is designed to be inspected—not merely accepted."
      highlights={[
        { label: "Scoring", value: "Transparent multi-signal evidence" },
        { label: "Models", value: "No external LLM inference API" },
        { label: "Meaning", value: "Alignment, not success probability" },
      ]}
      sections={SECTIONS}
      closing={{
        label: "Responsible operation",
        title: "Methodology needs safeguards.",
        body: "Scoring transparency is only one part of responsible hiring support. Review the operational boundaries and human-review requirements that surround every result.",
        primaryLabel: "Review safeguards",
        primaryTo: "/safeguards",
      }}
    />
  );
}
