import { createFileRoute } from "@tanstack/react-router";
import { Scale, ScanSearch, Waypoints } from "lucide-react";
import { PublicInfoPage, type PublicInfoSection } from "@/components/public-info-page";
import { createPublicPageStructuredData, OG_IMAGE_URL, SITE_URL } from "@/lib/site-metadata";

const DESCRIPTION =
  "Explore NeuralRecruit's resume review, job matching, candidate ranking, role comparison, and evidence-reporting capabilities.";

const STRUCTURED_DATA = createPublicPageStructuredData({
  path: "features",
  name: "NeuralRecruit Features",
  description: DESCRIPTION,
  pageType: "CollectionPage",
});

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "NeuralRecruit Features - Four Evidence Review Workflows" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "NeuralRecruit Features" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/features` },
      { property: "og:image", content: OG_IMAGE_URL },
      { "script:ld+json": STRUCTURED_DATA },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/features` }],
  }),
  component: FeaturesPage,
});

const SECTIONS: readonly PublicInfoSection[] = [
  {
    id: "workflows",
    label: "Focused workflows",
    title: "Start with the hiring question.",
    body: "Each workflow has a deliberately narrow purpose. Resume-only review never invents job fit, while job-aware modes add role evidence only when a job description is present.",
    icon: Waypoints,
    items: [
      {
        title: "Resume Review",
        description:
          "Inspect ATS readability, section coverage, detected skills, experience evidence, resume improvements, and suitable IT role families without a job description.",
      },
      {
        title: "Resume to Job",
        description:
          "Compare one resume with one job description using technical fit, keyword retrieval, skill coverage, context, experience, and document-quality signals.",
      },
      {
        title: "Rank Candidates",
        description:
          "Review several resumes against the same role criteria so every candidate is assessed against a consistent job description.",
      },
      {
        title: "Compare Roles",
        description:
          "Compare one resume with several job descriptions to identify which role has the strongest documented evidence alignment.",
      },
    ],
  },
  {
    id: "evidence-output",
    label: "Inspectable output",
    title: "Evidence stays visible.",
    body: "Reports expose the components behind the result so a reviewer can verify what was found, what was not found, and which evidence requires human follow-up.",
    icon: ScanSearch,
    items: [
      {
        title: "Matched and missing evidence",
        description:
          "Skills are shown with their resume section when evidence is available. Missing items are framed as areas to review, not proof that a candidate lacks a capability.",
      },
      {
        title: "Experience interpretation",
        description:
          "Dated work-history ranges are normalized, overlapping periods are merged, and internships or projects remain distinguishable from full professional experience.",
      },
      {
        title: "Document health",
        description:
          "ATS readability, section completeness, action-oriented language, measurable outcomes, and structure are reported separately from job alignment.",
      },
      {
        title: "Evidence exports",
        description:
          "Reviewers can export structured reports for discussion while retaining responsibility for the final employment decision.",
      },
    ],
  },
  {
    id: "boundaries",
    label: "Operational boundaries",
    title: "Built for review, not automation.",
    body: "NeuralRecruit organizes information for a responsible reviewer. It does not automatically hire, reject, or predict a candidate's future job performance.",
    icon: Scale,
    items: [
      {
        title: "Human decision required",
        description:
          "Every score is advisory. A person must verify the job criteria, source evidence, reasonable accommodations, and the full candidate context.",
      },
      {
        title: "No external LLM requirement",
        description:
          "The deployed scoring path uses deterministic parsing, lexical retrieval, local statistical methods, and a curated IT taxonomy without a paid LLM inference API.",
      },
      {
        title: "Controlled file handling",
        description:
          "The public showcase validates file type and size, removes temporary uploads after extraction, and disables scan-history persistence.",
      },
      {
        title: "IT-focused scope",
        description:
          "The taxonomy covers common software, data, AI, cloud, security, network, quality, support, mobile, and enterprise technology roles.",
      },
    ],
  },
] as const;

function FeaturesPage() {
  return (
    <PublicInfoPage
      eyebrow="Product capabilities"
      title="Four ways to review"
      accent="technical talent."
      intro="Use a resume on its own, add one job description, rank candidates against shared criteria, or compare several roles. Each mode preserves the difference between evidence and a hiring decision."
      highlights={[
        { label: "Workflows", value: "Four focused review modes" },
        { label: "Job context", value: "Used only when the question needs it" },
        { label: "Decision", value: "Always remains with a human" },
      ]}
      sections={SECTIONS}
      closing={{
        label: "Understand the signals",
        title: "See how the evidence is calculated.",
        body: "The methodology page explains parsing, taxonomy matching, retrieval signals, experience handling, calibration, and important limitations.",
        primaryLabel: "Read methodology",
        primaryTo: "/methodology",
      }}
    />
  );
}
