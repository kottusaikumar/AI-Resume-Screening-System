import { createFileRoute } from "@tanstack/react-router";
import { Scale, ShieldCheck, UserCheck } from "lucide-react";
import { PublicInfoPage, type PublicInfoSection } from "@/components/public-info-page";
import { createPublicPageStructuredData, OG_IMAGE_URL, SITE_URL } from "@/lib/site-metadata";

const DESCRIPTION =
  "Review NeuralRecruit's human oversight, evidence transparency, privacy, fairness, security, and responsible-use safeguards.";

const STRUCTURED_DATA = createPublicPageStructuredData({
  path: "safeguards",
  name: "NeuralRecruit Responsible-Use Safeguards",
  description: DESCRIPTION,
});

export const Route = createFileRoute("/safeguards")({
  head: () => ({
    meta: [
      { title: "NeuralRecruit Safeguards - Human Review and Responsible Use" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "NeuralRecruit Responsible-Use Safeguards" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/safeguards` },
      { property: "og:image", content: OG_IMAGE_URL },
      { "script:ld+json": STRUCTURED_DATA },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/safeguards` }],
  }),
  component: SafeguardsPage,
});

const SECTIONS: readonly PublicInfoSection[] = [
  {
    id: "human-oversight",
    label: "Human oversight",
    title: "The reviewer remains accountable.",
    body: "NeuralRecruit is decision support for organizing resume evidence. It is not configured to make final employment decisions or automatically move candidates through a hiring process.",
    icon: UserCheck,
    items: [
      {
        title: "No automatic hiring verdict",
        description:
          "The interface presents advisory alignment and resume-quality signals. It does not label a candidate as hired, rejected, successful, or unsuitable.",
      },
      {
        title: "Verify source evidence",
        description:
          "Reviewers should compare every important finding with the original resume, job criteria, interview evidence, and any reasonable accommodation context.",
      },
      {
        title: "Document the decision",
        description:
          "Employment decisions should record the job-related criteria and human rationale rather than relying on an unexplained score threshold.",
      },
      {
        title: "Provide a challenge path",
        description:
          "Organizations adopting the code should create a process for correcting parsed information and challenging consequential decisions.",
      },
    ],
  },
  {
    id: "fairness",
    label: "Fairness boundaries",
    title: "Job evidence is not a proxy for human worth.",
    body: "Resume data can reflect unequal access, historical bias, career breaks, disability, migration, and nontraditional experience. A transparent score does not remove those risks.",
    icon: Scale,
    items: [
      {
        title: "Use job-related criteria",
        description:
          "Job descriptions and mandatory skills should be reviewed for necessity, proportionality, accessibility, and relevance before candidate comparison.",
      },
      {
        title: "Avoid protected-attribute inference",
        description:
          "Do not use names, photos, age indicators, nationality, health information, or other protected characteristics as scoring signals.",
      },
      {
        title: "Test representative groups",
        description:
          "Before organizational use, evaluate extraction quality and outcome differences across resume formats, career paths, seniority levels, languages, and relevant demographic groups.",
      },
      {
        title: "Monitor after changes",
        description:
          "Taxonomy, parsing, scoring-weight, and job-template changes should trigger renewed validation rather than inheriting earlier assumptions.",
      },
    ],
  },
  {
    id: "operational-controls",
    label: "Operational controls",
    title: "Reduce exposure at every boundary.",
    body: "The public showcase uses constrained uploads, temporary files, disabled history persistence, rate limits, and bounded browser OCR. Production adopters need additional organizational controls.",
    icon: ShieldCheck,
    items: [
      {
        title: "Validate uploads",
        description:
          "File signatures, supported extensions, request sizes, extracted-text length, and multi-file limits are checked before analysis.",
      },
      {
        title: "Minimize retained data",
        description:
          "The public showcase removes temporary upload files after extraction and does not save scan history. Self-hosted deployments must define their own retention policy.",
      },
      {
        title: "Bound resource-intensive work",
        description:
          "Scanned-PDF OCR is constrained and runs in the browser for the free public deployment to reduce backend memory pressure.",
      },
      {
        title: "Treat deployment as jurisdiction-specific",
        description:
          "Employment, privacy, accessibility, and automated-decision rules vary. Organizations need qualified legal and compliance review for their intended use.",
      },
    ],
  },
] as const;

function SafeguardsPage() {
  return (
    <PublicInfoPage
      eyebrow="Responsible-use safeguards"
      title="Support human judgment."
      accent="Never replace it."
      intro="Hiring is consequential. NeuralRecruit keeps evidence visible, limits the meaning of its scores, and requires human review. Any organization adopting the code remains responsible for validation, fairness, privacy, accessibility, and lawful use."
      highlights={[
        { label: "Final decision", value: "Human reviewer only" },
        { label: "Protected traits", value: "Not valid scoring criteria" },
        { label: "Deployment", value: "Needs organization-specific validation" },
      ]}
      sections={SECTIONS}
      closing={{
        label: "Data handling",
        title: "Know what happens to an uploaded resume.",
        body: "The privacy page describes the public showcase's temporary processing, browser OCR, backend analysis, retention boundaries, and third-party infrastructure.",
        primaryLabel: "Read privacy details",
        primaryTo: "/privacy",
      }}
    />
  );
}
