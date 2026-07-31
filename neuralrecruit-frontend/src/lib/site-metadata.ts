export const SITE_URL = "https://neuralrecruit.vercel.app";
export const SITE_NAME = "NeuralRecruit";
export const SITE_DESCRIPTION =
  "Source-available, explainable resume intelligence and job-matching decision support for technical hiring.";
export const GITHUB_URL = "https://github.com/kottusaikumar/AI-Resume-Screening-System";
export const GITHUB_ISSUES_URL = `${GITHUB_URL}/issues`;
export const OG_IMAGE_URL = `${SITE_URL}/og-neuralrecruit.png`;

export const HOME_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description: SITE_DESCRIPTION,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Human resources decision-support software",
      operatingSystem: "Any operating system with a modern web browser",
      browserRequirements: "Requires JavaScript and a modern web browser",
      softwareVersion: "2.1",
      isAccessibleForFree: true,
      codeRepository: GITHUB_URL,
      screenshot: OG_IMAGE_URL,
      featureList: [
        "Resume-only ATS and evidence review",
        "Resume-to-job-description matching",
        "Candidate ranking against a shared role",
        "Role comparison for one resume",
        "Explainable scoring signals",
        "Temporary resume processing",
      ],
      author: {
        "@type": "Person",
        name: "Kottu Sai Kumar",
        url: "https://github.com/kottusaikumar",
      },
      sameAs: [GITHUB_URL],
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "Does NeuralRecruit make hiring decisions?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. NeuralRecruit organizes resume evidence and role alignment for human review. It never automatically hires or rejects a candidate.",
          },
        },
        {
          "@type": "Question",
          name: "Does NeuralRecruit send resumes to an external AI API?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No paid or external LLM API is required. Parsing, retrieval, and scoring use self-hosted open-source components.",
          },
        },
        {
          "@type": "Question",
          name: "Can NeuralRecruit review a resume without a job description?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Resume Review checks parseability, structure, skills, experience evidence, and suitable IT role families without inventing a job-match score.",
          },
        },
      ],
    },
  ],
} as const;

export const ABOUT_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  "@id": `${SITE_URL}/about#page`,
  url: `${SITE_URL}/about`,
  name: `About ${SITE_NAME}`,
  description:
    "Project information, architecture, responsible-use safeguards, and source code for NeuralRecruit.",
  inLanguage: "en",
  dateModified: "2026-07-31",
  mainEntity: {
    "@id": `${SITE_URL}/#software`,
  },
} as const;
