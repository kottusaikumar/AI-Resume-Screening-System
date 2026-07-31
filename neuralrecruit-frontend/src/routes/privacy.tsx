import { createFileRoute } from "@tanstack/react-router";
import { ServerCog, Trash2, Waypoints } from "lucide-react";
import { PublicInfoPage, type PublicInfoSection } from "@/components/public-info-page";
import { createPublicPageStructuredData, OG_IMAGE_URL, SITE_URL } from "@/lib/site-metadata";

const DESCRIPTION =
  "Learn how the NeuralRecruit public showcase handles uploaded resumes, browser OCR, backend processing, temporary files, history, and third-party hosting.";

const STRUCTURED_DATA = createPublicPageStructuredData({
  path: "privacy",
  name: "NeuralRecruit Public Showcase Privacy",
  description: DESCRIPTION,
});

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "NeuralRecruit Privacy - Public Showcase Data Handling" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "NeuralRecruit Public Showcase Privacy" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/privacy` },
      { property: "og:image", content: OG_IMAGE_URL },
      { "script:ld+json": STRUCTURED_DATA },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/privacy` }],
  }),
  component: PrivacyPage,
});

const SECTIONS: readonly PublicInfoSection[] = [
  {
    id: "processing",
    label: "Processing path",
    title: "What happens when you analyse a resume.",
    body: "Opening the landing page or upload workspace does not send a resume to the backend. Processing begins only after a user selects a file and starts analysis.",
    icon: Waypoints,
    items: [
      {
        title: "Local preparation",
        description:
          "The browser validates the selected file and can extract searchable PDF text. For image-only PDFs, bounded OCR may run in the browser.",
      },
      {
        title: "Analysis request",
        description:
          "When Analyse is selected, the resume file and any required job-description text are transmitted over HTTPS to the NeuralRecruit backend hosted on Render.",
      },
      {
        title: "Temporary extraction",
        description:
          "The backend writes the upload to a temporary file for signature validation and text extraction, then removes that temporary file in a guaranteed cleanup step.",
      },
      {
        title: "Result returned",
        description:
          "The backend returns structured evidence and report data to the browser. The public showcase does not require an account or save the analysis to scan history.",
      },
    ],
  },
  {
    id: "retention",
    label: "Retention boundaries",
    title: "Designed to minimize stored candidate data.",
    body: "The public showcase is configured with scan-history persistence disabled and resume-preview storage disabled. It should still be treated as an internet-hosted demonstration, not a confidential production HR system.",
    icon: Trash2,
    items: [
      {
        title: "No showcase scan history",
        description:
          "Resume Review, Job Match, Rank Candidates, and Compare Roles do not persist reports to the application's history database while showcase mode is enabled.",
      },
      {
        title: "Temporary files are deleted",
        description:
          "Upload files are removed after extraction whether analysis succeeds or fails. Free-hosting restarts also discard the service's ephemeral local filesystem.",
      },
      {
        title: "Operational logs",
        description:
          "Infrastructure and application logs may record request status, processing duration, report identifiers, and sanitized filenames for reliability and debugging.",
      },
      {
        title: "Browser session",
        description:
          "Uploaded-file selections and generated reports remain available in the active browser interface only for the current interaction unless the user exports them.",
      },
    ],
  },
  {
    id: "service-boundaries",
    label: "Service boundaries",
    title: "Where information is processed.",
    body: "The frontend and backend run on separate hosting providers. No paid or external LLM inference API is required by the public analysis path.",
    icon: ServerCog,
    items: [
      {
        title: "Vercel frontend",
        description:
          "Vercel serves the public website and browser application. Standard hosting request metadata may be processed under Vercel's infrastructure terms.",
      },
      {
        title: "Render backend",
        description:
          "Render receives analysis requests and runs the FastAPI document-processing and scoring service. Standard request and runtime metadata may be available to the hosting provider.",
      },
      {
        title: "No external LLM submission",
        description:
          "The deployed scoring path does not send resume or job-description text to a paid generative-model API.",
      },
      {
        title: "Use synthetic data when possible",
        description:
          "For demonstrations and testing, remove unnecessary contact details or use a synthetic resume. Do not upload information you are not authorized to process.",
      },
    ],
  },
] as const;

function PrivacyPage() {
  return (
    <PublicInfoPage
      eyebrow="Public showcase privacy"
      title="Temporary processing,"
      accent="clearly explained."
      intro="NeuralRecruit minimizes candidate-data retention in its public showcase, but uploaded resumes still travel to an internet-hosted analysis service. Use only documents you are authorized to process and avoid unnecessary sensitive information."
      highlights={[
        { label: "Upload", value: "Sent only after Analyse is selected" },
        { label: "History", value: "Disabled in the public showcase" },
        { label: "Inference", value: "No external LLM submission" },
      ]}
      sections={SECTIONS}
      closing={{
        label: "Questions or corrections",
        title: "Inspect the implementation directly.",
        body: "The source code is public. Use the repository's issue tracker to report a reproducible privacy, security, parsing, or responsible-use concern.",
        primaryLabel: "Return to showcase",
        primaryTo: "/",
      }}
    />
  );
}
