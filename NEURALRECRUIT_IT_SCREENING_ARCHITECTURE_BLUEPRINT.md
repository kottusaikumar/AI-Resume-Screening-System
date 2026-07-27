# NeuralRecruit: Production Architecture Blueprint

## IT-only resume screening and recruiter decision support

**Document type:** Research, product, UX, data, ML, security, performance, and deployment blueprint  
**Scope:** Software, data, AI/ML, cloud, DevOps, QA, networking, cybersecurity, platform, SRE, systems, and IT support roles  
**Constraint:** Self-hosted and open-source software/models only; no paid or external generative-AI API  
**Product mode:** Public showcase with no login, no signup, and no account dependency  
**Decision posture:** Decision support for a human recruiter—not autonomous hiring or rejection

---

## Executive decision

NeuralRecruit already has a useful demonstration surface: resume review, one-to-one matching, one resume against multiple roles, and multiple resumes against one role. Its present architecture is a capable prototype, but its score must not yet be represented as an objective “match percentage.” The current formula combines signals with incompatible scales, double-counts lexical similarity, converts cosine similarity into an inflated 0–1 range, and mixes document presentation quality into job qualification.

The production target should be a **five-layer evidence system**:

1. **Scope and document quality:** determine whether the document is an IT resume, whether parsing is reliable, and whether human review is required.
2. **Structured extraction:** produce versioned, source-linked facts—roles, dates, skills, projects, education, certifications, and evidence spans.
3. **Eligibility and explicit constraints:** apply only recruiter-selected, job-related gates. Never infer protected characteristics.
4. **Hybrid retrieval and reranking:** retrieve with structured filters, lexical search, and dense embeddings; fuse ranks; rerank the shortlist with a cross-encoder.
5. **Calibrated decision support:** show evidence coverage, fit band, confidence, missing evidence, and the exact resume/JD passages supporting each conclusion.

The recommended MVP is a **modular monolith**, not microservices: React/TanStack frontend, FastAPI API, separate background worker processes, PostgreSQL with pgvector, Redis, MinIO-compatible storage, ClamAV, and locally hosted embedding/reranking models. Service boundaries should be explicit in code and jobs, but physical separation should wait until load or team ownership requires it.

### Principal product rules

| Rule | Decision | Why |
|---|---|---|
| Hiring authority | Human remains the decision-maker | A ranking tool can miss unconventional evidence and may create disparate impact |
| Score presentation | Use “evidence alignment,” fit band, and confidence—not “83% qualified” | Retrieval scores are not probabilities without outcome-based calibration |
| Job-fit vs resume quality | Separate them completely | Formatting does not make a candidate more qualified |
| Missing evidence | Say “not evidenced in this resume,” not “candidate lacks skill” | A resume is incomplete evidence, not a full inventory of a person |
| Hard requirements | Explicit recruiter-controlled gates only | Prevents hidden assumptions and makes decisions auditable |
| Ranking fusion | RRF or validated normalized fusion, then reranking | BM25 and cosine operate on incompatible score distributions |
| IT-only scope | Classify, abstain, and route uncertain cases | A hard keyword block would reject adjacent or unconventional IT profiles |
| Generative LLM | Not required for MVP; never the scoring authority | Deterministic extraction and retrieval are cheaper, faster, and more auditable |
| Architecture | Modular monolith plus workers first | Delivers production boundaries without premature distributed-system cost |
| Model selection | Benchmark on a private IT hiring gold set | Public retrieval benchmarks do not establish validity for employment screening |

### Recommended product vocabulary

- **Fit band:** High evidence alignment / Moderate / Low / Insufficient evidence
- **Confidence:** confidence in extraction and evidence coverage, not confidence that the candidate will succeed
- **Required-skill coverage:** required skills with explicit supporting evidence
- **Evidence strength:** mentioned, demonstrated in project/work, recent use, duration-supported, or independently verified
- **Document quality:** parseability, completeness, chronology consistency, and ATS readability—reported separately
- **Human review required:** OCR-heavy, low extraction confidence, ambiguous dates, contradictory evidence, or close ranking

---

# 1. Reverse engineering modern ATS and recruiter systems

## 1.1 What industry products actually do

Modern ATS products are primarily **systems of record and recruiter workflow**, supplemented by search and matching. They do not rely on a single magical similarity percentage. Their recurring architecture is:

```text
Application / upload
        |
        v
File validation -> parsing -> candidate/profile fields -> deduplication
        |                              |
        |                              v
        +----------------------> searchable index
                                       |
Job and recruiter filters ------------+
                                       |
                         keyword / Boolean / semantic retrieval
                                       |
                              shortlist and review
                                       |
                     stages, scorecards, notes, disposition
                                       |
                         analytics, audit, compliance
```

Lever describes resume parsing as turning readable resumes into candidate profile fields such as contact details and work history, with manual correction available; image-only resumes are not treated as ordinary parseable documents. Greenhouse exposes candidate/application filters, custom fields, stages, source, tags, and potential duplicate detection. Its search supports full-text resume keywords and snippets. LinkedIn Recruiter combines explicit and context-inferred skills, aliases, structured filters, Boolean queries, and evidence locations. These public behaviors support a central conclusion: **structured filtering and evidence retrieval are first-class; semantic ranking is an enhancement, not a substitute.** Sources: [Lever resume parsing](https://help.lever.co/hc/en-us/articles/20087345054749-Understanding-resume-parsing), [Greenhouse candidate filters](https://support.greenhouse.io/hc/en-us/articles/360043184152-Candidate-and-prospect-filters), [Greenhouse resume keyword search](https://support.greenhouse.io/hc/en-us/articles/115004600186-Search-resumes-for-keywords), [LinkedIn Recruiter filters](https://www.linkedin.com/help/recruiter/answer/a411285), [LinkedIn skills filter](https://www.linkedin.com/help/recruiter/answer/a593591).

### Capability pattern by product class

| Product class | Dominant behavior | What NeuralRecruit should adopt | What not to imitate blindly |
|---|---|---|---|
| ATS systems of record | Application stages, recruiter ownership, scorecards, notes, compliance, search | Evidence-linked review, disposition reasons, comparison, export, auditability | Enterprise workflow breadth irrelevant to a public showcase |
| Talent CRM/search | Faceted search, Boolean, tags, rediscovery, deduplication | Precise filters before semantic ranking; reusable saved searches later | Treating all profile fields as equally reliable |
| Professional networks | Explicit + inferred skills, aliases, seniority/title filters, evidence context | Canonical skill concepts, alias expansion, role-family filters, evidence source | Using network behavior or profile popularity unavailable to this product |
| Job boards | Candidate search, query expansion, location/title/experience filtering | Fast retrieval and query transparency | Opaque “best candidate” claims |
| AI matching add-ons | Natural-language query to filters, calibrated criteria, ranked review | Translate JD into editable requirements; show exactly what was inferred | Letting model inference silently create mandatory requirements |

## 1.2 Resume parsing

Industry-grade parsing creates both:

1. A **normalized profile** for filters, comparisons, and analytics.
2. A **source-preserving document representation** for evidence and correction.

The second is essential. A field such as `Python: 5 years` must retain the page, section, line/span, parser version, extraction method, and confidence that produced it. Without provenance, recruiter explanations and regression analysis are impossible.

## 1.3 Indexing and retrieval

Production systems maintain multiple representations:

- exact normalized fields: role family, location, certification, education, dates;
- canonical skills and aliases;
- full-text fields with language analyzers;
- section and sentence chunks for semantic retrieval;
- document-level and evidence-level embeddings;
- recruiter-entered tags and disposition metadata.

Boolean and filters should run before or alongside semantic retrieval. LinkedIn documents `AND`, `OR`, `NOT`, quoted phrases, and parentheses; Greenhouse exposes Boolean and full-text resume search. NeuralRecruit should support a safe visual query builder plus an advanced text syntax on desktop. Sources: [LinkedIn Boolean search](https://www.linkedin.com/help/recruiter/answer/a524335), [Greenhouse Boolean queries](https://support.greenhouse.io/hc/en-us/articles/202360199-Search-candidates-using-Boolean-queries).

## 1.4 Ranking and candidate scoring

Industry ranking generally combines:

- recruiter-selected hard constraints;
- structured field matches;
- keyword and exact-phrase relevance;
- normalized title/role and seniority;
- semantic relevance;
- freshness or recency where job-related;
- prior workflow evidence, where legally and operationally appropriate;
- learned relevance from recruiter judgments at sufficient data volume.

LinkedIn publicly presents broad relevance labels and qualification evidence, not a promise that an arbitrary raw similarity is a hiring probability. Its documented bands also demonstrate that “matching” is a retrieval aid and not the employment decision itself. [LinkedIn AI-assisted search FAQ](https://www.linkedin.com/help/recruiter/answer/a1660341).

**Recommendation:** internally maintain ranking features and scores, but externally show:

- fit band;
- required/preferred evidence coverage;
- confidence and parsing warnings;
- reasons for the rank;
- side-by-side supporting passages;
- an editable recruiter assessment.

## 1.5 Recruiter workflow to reproduce

```text
Define role calibration
  -> review inferred requirements
  -> mark required / preferred / excluded
  -> set acceptable equivalents
  -> upload or select candidates
  -> apply structured gates
  -> retrieve + rank
  -> inspect evidence and conflicts
  -> compare shortlist
  -> record human disposition and reason
  -> export decision brief
  -> feed adjudicated labels into evaluation set
```

Greenhouse’s published talent-filtering flow uses skills, titles, location, required exact keywords, preferred terms, filters, and human review. That is the appropriate model: calibration first, matching second. [Greenhouse Talent Filtering](https://support.greenhouse.io/hc/en-us/articles/27104809835291-Talent-Filtering).

## 1.6 Industry features that matter to this showcase

**Must reproduce**

- parsing with correction and confidence;
- skill/title normalization;
- filters and Boolean search;
- evidence-linked ranking;
- recruiter calibration of requirements;
- batch ranking and role comparison;
- duplicate detection;
- human disposition and exportable report;
- reproducibility with parser/model/config versions.

**Do not build yet**

- interview scheduling;
- offer management;
- payroll/HRIS integration;
- employee onboarding;
- candidate messaging campaigns;
- broad non-IT occupation coverage.

Those functions define a general ATS, which conflicts with this product’s focused value proposition.

## 1.7 Cross-product reverse-engineering matrix

Exact commercial algorithms are proprietary. The defensible method is to compare public product behavior and documentation, not invent internal formulas.

| Product | Publicly observable design pattern | Architecture lesson |
|---|---|---|
| Greenhouse | Structured filters, full-text/Boolean search, stages, custom fields, talent filtering, human review | Filters and workflow remain primary; matching is assistive |
| Lever | Resume-to-profile parsing, readable-format constraints, editable candidate records | Parsing must be correctable and should not hide document limitations |
| Ashby | Full-text resume search, basic/advanced filters, job/department/source/stage/tags, Boolean modes | Search combines workflow metadata and document text; a single score is insufficient |
| Workday | Skills foundation, skill-based candidate/job recommendations, match factors/grades | Skills require a shared normalized foundation and understandable factors |
| SmartRecruiters | Talent acquisition workflow, search, screening, collaboration, integrations | Recruiter workflow and integrations are larger than the matching model |
| iCIMS | Resumes parsed into searchable/reportable profile fields and connected to recruiting workflows | Parsed fields must support both retrieval and reporting |
| SAP SuccessFactors | Standardized field mapping, multilingual parsing, editable/replaceable profile data, explicit accuracy limitation | Configurable mappings, supported-language declarations, and correction are production necessities |
| Oracle Recruiting | Required vs desired criteria, reverse candidate-to-job matching, profile/skills/experience/education factors, relative indicators | Bidirectional matching and factor-level explanations should be explicit |
| LinkedIn Recruiter | Boolean/faceted search, explicit and contextual skills, aliasing, evidence sources | Ontology, query expansion, and evidence location improve retrieval |
| Indeed Resume Search | Candidate discovery centered on job titles, skills, location, experience, and query/filter workflows | Search ergonomics and fast narrowing matter as much as model sophistication |
| ZipRecruiter | Job-candidate recommendations and recruiter/candidate matching workflow | Recommendations must remain a review aid, not a final decision |

Ashby publicly documents full-text resume and metadata filters plus Boolean behavior. Workday describes skills-based matching and match factors. iCIMS describes parsed resumes becoming searchable/reportable profiles. SAP warns that resume parsing is not always perfectly accurate and maps standardized fields to configured candidate profiles. Oracle documents required versus desired criteria, reverse matching, and relative factor indicators that do not replace detailed resume review. Sources: [Ashby candidate search](https://docs.ashbyhq.com/candidate-search), [Workday Skills Cloud](https://www.workday.com/en-us/products/human-capital-management/skills-cloud.html), [iCIMS data migration/resume parsing](https://community.icims.com/servlet/servlet.FileDownload?file=0151L00000Schpp), [SAP resume parsing](https://help.sap.com/docs/successfactors-recruiting/setting-up-and-maintaining-sap-successfactors-recruiting/configuring-resume-parsing?locale=en-US), [Oracle candidate suggestions](https://docs.oracle.com/en/cloud/saas/talent-management/faush/understand-suggested-candidates.html), [Oracle candidate/requisition matching](https://docs.oracle.com/en/cloud/saas/talent-acquisition/19d/otrcg/candidate-and-requisition-matching.html).

---

# 2. Public showcase landing page

## 2.1 First-page objective

Within five seconds, a visitor should understand:

> **IT resume screening with evidence—not black-box hiring scores.**  
> Review one resume, compare it to an IT job description, or rank technical candidates using locally hosted, explainable matching.

The default URL must open the landing page, not the scanner, a login dialog, a blank report, or an unfinished dashboard. Authentication-related UI and “admin@localhost” identity elements should be removed from the showcase experience.

## 2.2 Recommended information architecture

```text
Top navigation
  Product | How it works | Supported IT roles | Architecture | Privacy | Try demo

Hero
  IT-specific promise + evidence-first differentiator + primary demo CTA

Interactive product modes
  Resume Review | Resume ↔ Job | Rank Candidates | Compare Jobs

Proof through product
  Real screenshots / short controlled animation / example evidence trace

How it works
  Parse -> Normalize -> Retrieve -> Rerank -> Explain -> Human decision

Supported roles
  Software | Data | AI/ML | Cloud/DevOps | QA | Cyber/Network | Support

Why it is credible
  Local models | No external AI API | Explainable | IT ontology | Human review

Architecture and stack
  Small diagram plus expandable technical detail

Privacy
  Temporary processing, retention behavior, file deletion, model locality

Live demo
  Seeded sample documents + optional visitor upload

FAQ
  What the score means; limitations; scanned PDFs; data retention; model use

Footer
  GitHub | Architecture document | License | Security | Disclaimer
```

## 2.3 Section decisions

| Element | Design requirement | Reason | MVP |
|---|---|---|---|
| Hero | One outcome-focused sentence, IT role chips, “Try the live demo” | Immediately establishes niche and action | Essential |
| Product modes | Four clear cards; advanced cards marked desktop | Makes existing value visible before upload | Essential |
| Product proof | Actual UI, not abstract AI imagery | A showcase is judged by working evidence | Essential |
| Workflow | Six-step evidence pipeline | Builds trust and explains differentiation | Essential |
| Architecture | Compact visual, open-source stack labels | Appeals to technical evaluators and hiring managers | Essential |
| Supported roles | Grouped, searchable list; “IT roles only” boundary | Prevents general-ATS expectations | Essential |
| Demo | Seeded samples and visitor upload | Avoids forcing users to provide personal data | Essential |
| Privacy | Retention countdown and local-processing statement | Resume files contain sensitive PII | Essential |
| Metrics | Only measured, reproducible metrics | Fake accuracy/customer counters reduce trust | Essential |
| Testimonials/logos | Omit until real and permissioned | Fabricated social proof is harmful | Avoid |
| Login/signup | Omit | Explicit showcase requirement | Avoid |

## 2.4 Visual direction

Use the current premium white interface as the product baseline: cool white surfaces, near-black text, restrained blue for navigation/primary actions, and green only for verified success or active processing. Do not turn the entire page neon green or dark merely to signal “AI.”

- 12-column desktop grid; content maximum width approximately 1200–1280 px.
- 8 px spacing system; 12–16 px card radii; subtle 1 px borders; minimal shadows.
- One display typeface or well-tuned system sans; monospace only for small status metadata.
- Screenshots inside neutral browser frames, not phone mockups for a desktop recruiter workflow.
- Respect `prefers-reduced-motion`.
- No simulated percentages during analysis. Show named processing stages with real state.

## 2.5 Calls to action

- Primary: **Try IT Resume Review**
- Secondary: **Match Resume to Job**
- Technical: **View the architecture**
- Desktop-only advanced: **Rank candidates**

The demo should include synthetic sample documents so the visitor can explore without uploading personal information.

---

# 3. Mobile, tablet, and desktop UX

## 3.1 Capability policy

| Surface | Exposed modes | Why |
|---|---|---|
| Mobile | Resume Review; Resume vs one JD | Single-task flows fit a narrow viewport and mobile file-picker behavior |
| Tablet | Same by default; optional read-only batch results | Comparison tables remain difficult, but review is comfortable |
| Desktop | All four modes, advanced filters, calibration, compare, export | Batch file management and side-by-side evidence need width and precision |

Advanced modes should be hidden from mobile navigation, not merely disabled after the user opens them. Deep links should show a clear “Open on desktop for batch comparison” explanation with a safe route back.

## 3.2 Mobile information architecture

```text
Bottom navigation
  Review | Match | About

Review
  Add resume
  -> file checks
  -> processing stages
  -> quality + evidence report

Match
  Add resume
  -> paste/upload JD
  -> review inferred requirements
  -> run match
  -> fit band + evidence cards
```

Use one sticky primary action, full-width inputs, section accordions, 44 px minimum targets, and evidence cards rather than dense charts. Never require horizontal scrolling for core information.

## 3.3 Responsive result design

- **Mobile:** ordered cards: outcome, required evidence, gaps, strengths, warnings, detailed evidence.
- **Tablet:** two-column summary where safe; details remain stacked.
- **Desktop:** summary rail + evidence workspace; optional side-by-side resume/JD passages.

Charts are secondary. A recruiter needs “what evidence supports this?” before a radar chart or gauge.

## 3.4 Animation and loading

The screening screen should reflect actual backend states:

1. validating file;
2. extracting text or OCR;
3. detecting sections;
4. normalizing IT skills;
5. comparing role evidence;
6. preparing report.

Each completed stage becomes stable; the active stage alone animates. If a task exceeds an expected window, display an honest reason such as “OCR is reading image-based pages.” Do not run a fixed theatrical scan that can complete before or long after the server task.

Accessibility requirements:

- screen-reader live region for stage changes;
- no rapid flicker or continuous sweeping laser;
- reduced-motion alternative;
- status conveyed by icon and text, not color alone;
- keyboard focus preserved when results replace progress;
- WCAG 2.2 AA contrast and target sizing.

---

# 4. Feature audit

## 4.1 Current features

| Feature | Classification | Keep/change | Product rationale |
|---|---|---|---|
| Single resume review | **Must have** | Make default demo action; separate ATS readability from candidate capability | Lowest-friction value and mobile-safe |
| ATS score | **Important but redesign** | Split into document quality, evidence completeness, and warnings | A single ATS score implies a standard that does not exist |
| Strengths/weaknesses/suggestions | **Important** | Ground every statement in text evidence; use neutral wording | Useful only when traceable and non-speculative |
| Resume vs single JD | **Must have** | Add editable requirement calibration before scoring | Core recruiter and candidate use case |
| Skill match/missing skills | **Must have** | Distinguish required/preferred and “not evidenced” | Avoids unsupported claims |
| Keyword match | **Important** | Preserve as lexical evidence, not a standalone outcome | Exact technical identifiers matter |
| Semantic match | **Important** | Use section/chunk retrieval plus reranker | Document-level cosine is too coarse |
| One resume vs multiple JDs | **Important** | Desktop; normalize per role and show evidence | Helps candidates/recruiters choose best-fit role |
| Multiple resumes vs one JD | **Must have for desktop** | Add gates, shortlist, comparison, human disposition | Main recruiter workflow |
| Candidate ranking | **Important but high risk** | Rank with uncertainty; never auto-reject | Ranking magnifies model and data errors |
| History | **Optional for public showcase** | Keep anonymous session history with short TTL; persistent history only later | No-login product cannot safely imply private accounts |
| Skills database | **Important internally** | Replace flat list with versioned ontology and admin import pipeline | Canonicalization is foundational |
| Analytics | **Optional in showcase; important later** | Demo metrics should be synthetic; production analytics need normalized events | Avoid leaking uploaded-resume information |
| Configurable scoring sliders | **Unnecessary in public UI** | Replace with named, validated role profiles; advanced admin only | Arbitrary sliders create false precision and non-reproducible rankings |
| Login/account panel | **Remove** | No login, identity card, logout, or auth modal | Conflicts with showcase requirement |
| “Forward to hiring manager” | **Remove** | Replace with export/share report only if deliberately invoked | No real external workflow exists |
| Notifications | **Remove for MVP** | Add only when asynchronous saved jobs exist | Decorative controls reduce credibility |
| Dark-mode screening-only surface | **Remove** | Respect global theme; white mode must remain white | Theme inconsistency looks like a separate product |

## 4.2 Missing enterprise and recruiter features

### Must have

- JD calibration: required, preferred, acceptable equivalent, disqualifier, evidence expectation.
- Evidence provenance: page, section, span, extraction confidence, parser/model/config version.
- Parse correction interface and rerun.
- Duplicate detection using normalized contact identifiers plus conservative similarity.
- Side-by-side candidate comparison with same criteria and no hidden sort features.
- Human decision/disposition with reason codes and override notes.
- Role-specific weight profiles that are versioned, validated, and locked per run.
- Exportable decision brief with limitations and evidence.
- Audit trail and reproducibility.
- Retention/deletion controls.
- Low-confidence and OCR review queues.

### Should have

- Saved searches and visual Boolean query builder.
- Candidate rediscovery from prior roles.
- Bulk job/resume ingestion with progress and partial retry.
- Recruiter calibration templates for IT role families.
- Skill equivalence editor with impact preview.
- Comparison of parser/model versions before release.
- Suppression of PII during the first review pass.
- Structured rejection/disposition reasons separated from model recommendations.

### Nice to have

- ATS integrations and webhooks.
- Team comments/mentions when authentication is introduced for a real deployment.
- Interview kit generated from evidenced skills and gaps.
- Candidate-facing improvement report with different language from recruiter report.
- Local extractive narrative summarization.

## 4.3 Missing AI and explainability features

- domain/scope classifier with abstention;
- section-aware embeddings;
- skill entity linking with ambiguity confidence;
- evidence strength and recency;
- requirement inference followed by recruiter confirmation;
- cross-encoder reranking;
- calibrated fit bands and confidence;
- counterfactual explanation (“adding evidence for X would change required coverage,” not “learn X to get 90%”);
- drift and slice evaluation;
- active-learning queue for uncertain skill aliases and ranking disagreements;
- protected-information masking for evaluation and optional review.

## 4.4 Candidate features

Candidate-facing output must not reveal another candidate’s rank or private JD calibration. It should focus on:

- ATS readability and parse preview;
- evidence completeness;
- role alignment with explicit JD;
- missing or weakly evidenced requirements;
- safe wording improvements that remain truthful;
- privacy and deletion;
- downloadable report.

Do not advise keyword stuffing, fabricate experience, or optimize for a proprietary ATS “score.”

---

# 5. Production resume-parsing pipeline

## 5.1 Target pipeline

```text
Upload
  |
  +-> admission controls
  |     extension + MIME + signature + size + page count + archive limits
  |
  +-> quarantine and malware scan
  |
  +-> immutable source object (short retention)
  |
  +-> native extraction
  |     PDF text/geometry | DOCX structure | TXT decode
  |
  +-> page-level quality assessment
  |     coverage | character density | replacement chars | layout ambiguity
  |
  +-> selective OCR for failed pages only
  |
  +-> layout and reading-order reconstruction
  |
  +-> section segmentation
  |
  +-> field/entity extraction
  |
  +-> normalization and entity linking
  |
  +-> validation, conflict checks, confidence
  |
  +-> searchable chunks + embeddings + evidence graph
  |
  +-> parse review / correction
```

Every output must include `source_span`, `page`, bounding region when available, `method`, `confidence`, `parser_version`, and `created_at`.

## 5.2 Tool comparison and recommendation

| Tool | Strengths | Limitations | Recommended use |
|---|---|---|---|
| PyMuPDF | Fast PDF text, words, blocks, coordinates, page rendering | `sort=True` does not solve every multi-column order; tables require extra logic | Primary PDF extractor and renderer |
| pdfplumber | Character/line geometry and configurable table extraction | Slower; not a universal layout model | Targeted tables and difficult page diagnostics |
| Apache Tika | Broad format detection and text/metadata extraction | JVM/server operational cost; output may lose fine layout | Fallback and enterprise format gateway, not default for PDF |
| python-docx | Safe access to paragraphs, tables, styles, relationships | Text boxes, drawings, headers, and complex layout need explicit handling | Primary DOCX parser with relationship inspection |
| Tesseract | Mature open-source OCR with language packs | Layout and accuracy vary; CPU-heavy | Selective OCR fallback |
| RapidOCR | Lightweight ONNX-based OCR and convenient local inference | Must be benchmarked by document language/layout | Alternative/faster OCR path where validated |
| LayoutParser / DocTR | Layout-aware document components | Model size, training-domain mismatch, GPU benefit | Future difficult-layout tier |
| spaCy | Fast rules, tokenization, entity pipelines | Generic NER does not understand IT skill evidence automatically | Deterministic field rules and trained/custom entities |

PyMuPDF exposes text blocks and words with coordinates; its documentation also warns that natural reading order is not always preserved and multi-column pages need geometric handling. pdfplumber adds configurable table extraction. Tika is useful as a broad file-type extraction service. Sources: [PyMuPDF text extraction](https://pymupdf.readthedocs.io/en/latest/app1.html), [PyMuPDF text recipes](https://pymupdf.readthedocs.io/en/latest/recipes-text.html), [pdfplumber](https://github.com/jsvine/pdfplumber/blob/stable/README.md), [Apache Tika](https://tika.apache.org/), [Tesseract documentation](https://tesseract-ocr.github.io/docs/).

## 5.3 Current parser audit

The current backend is a strong prototype:

- PyMuPDF native text with `sort=True`;
- page-level OCR fallback;
- page and pixel limits;
- DOCX and TXT support;
- local processing.

Production gaps:

- DOCX paragraphs alone miss tables, headers/footers, hyperlinks, and text boxes;
- no explicit multi-column reading-order reconstruction;
- no source bounding boxes retained in the normalized profile;
- no per-field confidence or conflict representation;
- no parse correction/review loop;
- no model/parser version attached to each field;
- OCR success is judged too heavily by character count rather than semantic and geometric quality;
- no hyperlink relationship extraction for GitHub, LinkedIn, or portfolio URLs;
- no normalized chronology with overlapping-job handling.

## 5.4 Layout and section detection

Use a tiered strategy:

1. **Geometry rules:** cluster blocks into columns; identify full-width headers; reconstruct reading order.
2. **Heading lexicon:** multilingual/variant section names such as “Professional Experience,” “Career History,” “Selected Projects.”
3. **Typography features:** font size, weight, whitespace, all-caps, delimiter lines.
4. **Sequence classifier:** optional small local model to label lines/blocks where rules are uncertain.
5. **Human correction:** surface low-confidence boundaries.

Sections should be canonicalized to:

`summary`, `skills`, `experience`, `projects`, `education`, `certifications`, `publications`, `awards`, `links`, and `other`.

## 5.5 Entity extraction and normalization

| Entity | Extraction approach | Validation |
|---|---|---|
| Name | header-zone patterns + NER | avoid treating job title as name; never use in matching |
| Email/phone | strict patterns and normalization | retain original encrypted; exclude from model features |
| GitHub/LinkedIn/portfolio | visible URL + DOCX/PDF hyperlink targets | domain allowlist, normalized URL, no external crawling by default |
| Job title/company | section-aware sequence rules/model | chronology and block association |
| Dates | locale-aware parser + ranges | ambiguity flags; open-ended “present”; overlap-aware |
| Duration | derived from normalized intervals | never sum overlapping jobs twice |
| Skills | ontology matcher + context classifier | concept ID, surface form, negation, evidence type |
| Education | institution/degree/field/date | distinguish course from degree |
| Certifications | catalog/patterns + issuer | expiry and version where evidenced |
| Projects | section/block detection | associated skills, outcomes, URL, dates |
| Achievements | quantified/contextual sentence extraction | do not invent impact from absence |

## 5.6 Confidence model

Confidence must be decomposed:

- `document_parse_confidence`;
- `section_confidence`;
- `field_extraction_confidence`;
- `entity_link_confidence`;
- `chronology_confidence`;
- `evidence_coverage`.

Do not average these into one opaque number. Low document confidence should reduce automation and trigger review; it should not reduce job fit.

## 5.7 Complexity and release timing

| Capability | Performance impact | Complexity | Release |
|---|---:|---:|---|
| PyMuPDF + structured DOCX extraction | Low | Medium | MVP |
| Selective OCR | High only on affected pages | Medium | MVP |
| Coordinates and source spans | Moderate storage | Medium | MVP |
| Rule-based section detection | Low | Medium | MVP |
| Parse correction UI | Low runtime | Medium | MVP |
| Learned layout model | Moderate/high | High | V2 |
| External URL enrichment | Network/privacy risk | High | Avoid in showcase; enterprise opt-in |

---

# 6. IT skill ontology

## 6.1 Why a flat skill list is insufficient

“Java,” “Java 17,” “Spring,” “Spring Boot,” “JVM,” and “Jakarta EE” are related but not interchangeable. “Azure DevOps” can be a product; “DevOps” is a discipline. “React” may be a frontend library or an ordinary verb. A production matcher therefore needs canonical concepts, context, relationship types, versioning, and provenance.

## 6.2 Ontology layers

```text
IT role family
  -> capability / competency
       -> canonical skill concept
            -> product/framework/library/tool
                 -> version

Concept relationships:
  broader-than | narrower-than | related-to | commonly-used-with
  successor-of | version-of | implements | hosted-on | requires

Lexical layer:
  preferred label | aliases | abbreviations | common misspellings
  language | case sensitivity | ambiguity rules | negative contexts
```

### Example

```text
Role family: Backend Engineering
  Capability: Web service development
    Skill: Java [language]
    Skill: Spring Boot [framework]
      alias: SpringBoot
      broader: Spring Framework
      commonly-used-with: Maven, Gradle
      version evidence: Spring Boot 2.x / 3.x
```

## 6.3 Recommended sources

- **O*NET:** occupation taxonomy and technology-skills data; useful for US occupation/technology associations. [O*NET database](https://www.onetcenter.org/database.html)
- **ESCO:** versioned linked-data concepts with persistent URIs, relationships, downloads, multilingual labels, and a local API. [Using ESCO](https://esco.ec.europa.eu/en/use-esco), [ESCO API](https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/esco-api)
- **NICE Framework:** authoritative task, knowledge, skill, and work-role language for cybersecurity. [NICE Framework](https://www.nist.gov/publications/workforce-framework-cybersecurity-nice-framework)
- **Internal IT overlay:** curated product versions, cloud services, frameworks, libraries, abbreviations, and employer-specific equivalences.

These sources should seed—not dictate—the ontology. They differ in granularity and update cadence, and a specialized IT matcher needs faster technology lifecycle updates.

## 6.4 Canonical skill record

Each concept requires:

- stable internal UUID and external source IDs;
- preferred label, aliases, language, and normalized search tokens;
- category and subcategory;
- role-family relevance;
- related/broader/narrower concepts with typed weights;
- version family and end-of-life metadata where relevant;
- ambiguity/negation patterns;
- source, license, curator, approval status;
- ontology version and effective dates;
- embedding generated from curated definition and examples.

## 6.5 Automatic normalization

Use a cascade, not embedding nearest-neighbor alone:

1. exact normalized alias;
2. case-sensitive alias where necessary (`R`, `C`, `.NET`);
3. phrase and token-boundary match;
4. context rules and section signal;
5. fuzzy match for misspellings with conservative thresholds;
6. embedding candidate generation from ontology definitions;
7. context-aware entity-link classifier;
8. abstain or curator review.

The matcher must represent:

- `explicit_mention`;
- `demonstrated_in_experience`;
- `demonstrated_in_project`;
- `education_only`;
- `certification_evidence`;
- `inferred_related_skill`;
- `negated_or_missing_requirement`.

Related skills must not silently become exact matches. For example, PyTorch evidence may increase relevance to a general deep-learning capability, but it does not satisfy a mandatory TensorFlow requirement unless the recruiter marks it as an acceptable equivalent.

## 6.6 Governance

- monthly technology additions;
- quarterly ontology release;
- immutable historic versions for reproducibility;
- dual review for alias changes affecting many candidates;
- impact analysis against the gold evaluation set;
- deprecation rather than deletion;
- visible equivalence rationale in recruiter calibration.

| Recommendation | Why | Performance | Complexity | Release |
|---|---|---:|---:|---|
| Canonical IDs and aliases | Stable matching and analytics | Improves exact retrieval | Medium | MVP |
| Hierarchy and typed relations | Supports equivalents without false exactness | Small graph lookup cost | Medium | MVP |
| Versioning/provenance | Reproducible decisions | Storage only | Medium | MVP |
| Context entity linker | Resolves ambiguous terms | Moderate inference | High | V2 |
| Learned ontology expansion | Finds emerging skills | Offline compute | High | V3 with curator approval |

---

# 7. Matching and ranking engine

## 7.1 Audit of the current formula

Current weights:

| Signal | Current weight | Audit |
|---|---:|---|
| Dense MiniLM similarity | 30% | Useful, but whole-document similarity and remapping cosine from `[-1,1]` to `[0,1]` inflate unrelated pairs |
| BM25 | 20% | Valuable lexical signal, but current pair-local sentence corpus and JD self-normalization do not behave like corpus-level retrieval |
| TF-IDF | 10% | Redundant with BM25; fit on only resume and JD is unstable and double-counts lexical overlap |
| Skill coverage | 20% | Important, but must distinguish required/preferred, canonical equivalence, and evidence strength |
| Positional skill | 10% | Useful concept, but a skill list should be weaker evidence than demonstrated work/project use |
| Experience-skill | 5% | Necessary, but simple regex duration and capped months are too fragile |
| Resume quality | 5% | Remove from job fit; report separately |

The raw weighted sum is not a probability. BM25 is unbounded and query-dependent; cosine has a different distribution; coverage is bounded; quality is unrelated to qualification. Qdrant’s official hybrid-search guidance explicitly warns against a fixed linear combination of raw dense and sparse scores because their scales differ, recommending rank fusion or validated normalization. [Qdrant hybrid queries](https://qdrant.tech/documentation/search/hybrid-queries/).

## 7.2 Signal decision matrix

| Signal | Keep? | Production role |
|---|---|---|
| Exact phrase/entity match | Yes | High-precision evidence and mandatory identifiers |
| BM25 | Yes | Lexical retrieval across the candidate corpus |
| TF-IDF | No as separate score | Debug baseline and offline comparison only |
| Dense embedding | Yes | Semantic retrieval of responsibilities/projects/equivalents |
| Sparse neural embedding | Later | Retrieval expansion if it beats BM25 on gold data |
| Cross-encoder | Yes | Rerank a small retrieved candidate/evidence set |
| Canonical skill coverage | Yes | Structured required/preferred evidence |
| Context/position | Yes, redesign | Evidence source strength, not arbitrary section bonus |
| Experience | Yes, redesign | Non-overlapping duration, recency, depth, responsibility context |
| Education/certification | Conditional | Only when job-related and explicitly calibrated |
| Resume quality | Separate | Parse/ATS readability report |
| Keyword stuffing penalty | Yes | Reduce repeated unsupported list-only mentions |
| Recency | Configurable | Relevant for fast-changing technology, not universal |
| Career progression | Future | Explainable structured feature; avoid normative assumptions |
| Protected/PII fields | Never | Must not enter ranking |

## 7.3 Recommended ranking architecture

```text
JD
 |
 +-> parse role, responsibilities, requirements, preferences
 |
 +-> recruiter confirms calibration
       required | preferred | equivalent | ignore | hard gate
 |
 +-> structured filters / gates
 |
 +-> candidate generation (high recall)
       BM25 / exact phrases
       dense section embeddings
       canonical skill/entity retrieval
 |
 +-> Reciprocal Rank Fusion
 |
 +-> top-N evidence and candidate reranking
       cross-encoder on requirement <-> evidence pairs
 |
 +-> structured feature aggregation
       coverage | strength | recency | duration | scope | conflicts
 |
 +-> calibrated fit band + confidence
 |
 +-> evidence-linked explanation and human review
```

A bi-encoder is efficient for first-stage retrieval; a cross-encoder jointly evaluates a query/passage pair and is more accurate but too expensive for the whole corpus. The standard pattern is retrieve first, rerank a shortlist. Sources: [Sentence Transformers usage](https://github.com/huggingface/sentence-transformers/blob/main/docs/sentence_transformer/usage/usage.rst), [retrieve and rerank](https://www.sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html), [Qdrant hybrid reranking](https://qdrant.tech/documentation/advanced-tutorials/reranking-hybrid-search/).

## 7.4 Requirement-level evidence scoring

Do not compare one full resume embedding to one full JD embedding. Split the JD into atomic criteria and responsibilities; retrieve and assess evidence for each.

For each requirement:

- requirement type: required/preferred/context;
- canonical concepts and acceptable equivalents;
- strongest supporting evidence span;
- evidence source: job, project, education, certification, list-only;
- recency and duration where meaningful;
- context fit: used/built/led/tested/operated vs merely mentioned;
- confidence and contradictions;
- coverage status: evidenced / partial / related / not evidenced / uncertain.

### Evidence-strength order

```text
dated work achievement or responsibility
    > dated project with concrete activity/outcome
    > certification or education appropriate to requirement
    > summary claim with supporting detail elsewhere
    > skills-list mention only
    > inferred related concept only
```

## 7.5 Proposed MVP scorecard

The user-facing result is not a probability. A transparent initial **evidence alignment index** may aggregate:

| Component | Starting share | Notes |
|---|---:|---|
| Required skill/capability evidence | 30 | Only confirmed requirements; no hidden gates |
| Responsibility/project semantic alignment | 20 | Requirement-to-evidence reranker |
| Evidence strength and contextual use | 15 | Work/project evidence above list-only mention |
| Relevant experience scope and recency | 10 | Role-configurable, overlap-safe |
| Preferred capabilities | 10 | Cannot compensate for failed explicit gate |
| Role family/title/seniority alignment | 5 | Normalize titles; avoid title-only rejection |
| Education/certification | 0–5 | Enabled only when job-related |
| Evidence consistency/completeness | 5–10 | Confidence/coverage, not formatting quality |

These are **starting hypotheses**, not validated universal weights. Role profiles should redistribute disabled components. All profiles require a version, rationale, evaluation result, owner, and effective date.

## 7.6 What is configurable vs learned

**Recruiter-configurable**

- required vs preferred;
- acceptable equivalents;
- explicit hard gates;
- minimum experience where lawful and job-related;
- certification/education necessity;
- recency preference;
- role-specific evidence expectations.

**System-managed and validated**

- retrieval fusion;
- evidence-source strength;
- extraction confidence handling;
- score calibration;
- duplicate/stuffing controls;
- default role-family profiles.

**Learned after sufficient adjudicated data**

- reranking model;
- role-family feature weights;
- fit-band calibration;
- query expansion/equivalence suggestions.

Do not learn directly from recruiter clicks or historical hire/reject labels without bias analysis. Prefer explicit pairwise relevance judgments and job-performance-linked validation where lawful.

## 7.7 Calibration

Before calibration, display ordinal bands based on evidence rules. After collecting a representative labeled set:

- use isotonic regression or Platt/logistic calibration on held-out recruiter judgments;
- measure Brier score and expected calibration error;
- calibrate by role family where sample size permits;
- publish sample size, date, and known limitations;
- maintain an “insufficient evidence” state;
- never claim likelihood of job success unless validated against appropriate outcomes.

## 7.8 Search infrastructure decision

| Scale/use | Recommendation | Why |
|---|---|---|
| Showcase to ~10k resumes | PostgreSQL full text + pgvector | One durable system, simple operations, adequate exact/ANN retrieval |
| Heavy Boolean/facets or >100k–1m profiles | Add OpenSearch | Mature analyzers, Boolean, faceting, hybrid search and relevance tooling |
| Vector-centric filtered retrieval | Qdrant optional | Strong filtered vectors, named sparse/dense vectors, multistage query API |
| Offline experimentation | FAISS | Excellent local ANN library, not a system of record |
| Very large distributed vector workloads | Milvus only if justified | Strong scale, much higher operational burden |
| Chroma | Avoid for production core | Good prototyping ergonomics; not needed beside PostgreSQL |
| Whoosh | Avoid for production | Useful embedded prototype, limited scale/operations |
| Elasticsearch | Prefer OpenSearch for strict OSS posture | OpenSearch aligns better with the stated open-source constraint |

pgvector supports exact search plus HNSW/IVFFlat, filtering strategies, iterative scans, and recall monitoring against exact search. HNSW provides a better speed/recall tradeoff at higher memory/build cost; IVFFlat builds faster and uses less memory. [pgvector](https://github.com/pgvector/pgvector). OpenSearch supports hybrid search and relevance optimization against judgment lists. [OpenSearch hybrid optimization](https://docs.opensearch.org/latest/search-plugins/search-relevance/optimize-hybrid-search/).

---

# 8. Explainable and responsible decision support

## 8.1 Explanation contract

Every conclusion must answer:

1. What criterion was evaluated?
2. What did the JD actually say?
3. What resume evidence was found?
4. Where was it found?
5. How was the concept normalized?
6. Was the evidence exact, equivalent, related, or absent?
7. What confidence and limitations apply?
8. How did it affect the fit band or rank?

## 8.2 Recruiter explanation

```text
Requirement: Production Python experience (required)
Status: Evidenced
Evidence: “Built and operated FastAPI services…” — Experience, page 1
Normalization: FastAPI -> Python web ecosystem
Strength: Work evidence, recent, 26 months inferred from role dates
Confidence: High extraction / Medium duration
Impact: Required capability satisfied; contributed to evidence coverage
```

For an absent item:

```text
Requirement: Kubernetes (required)
Status: Not evidenced in the submitted resume
Search performed: Kubernetes, K8s, orchestration context
Related evidence: Docker and ECS
Decision: Related evidence shown, but requirement not marked satisfied
Recruiter action: accept ECS as equivalent, request clarification, or keep gap
```

## 8.3 Candidate explanation

Candidate language must be constructive and scoped:

- “The resume does not provide evidence of Kubernetes.”
- “Your FastAPI experience appears in work history and strongly supports the backend-service requirement.”
- “The employment dates are ambiguous, so duration was not used.”
- “Add truthful project context if you have used this skill; do not add unsupported keywords.”

Avoid “You failed,” “You are not qualified,” personality inference, or certainty about skills absent from the document.

## 8.4 Ranking explanation

For each candidate rank:

- top three positive evidence groups;
- required items not evidenced;
- one reason the candidate ranks above/below adjacent candidates;
- parse/confidence warning;
- which constraints were applied;
- model, ontology, profile, and run versions;
- recruiter override/history.

Do not expose cross-candidate private evidence to candidate-facing reports.

## 8.5 Confidence and uncertainty

Confidence is determined by:

- document extraction quality;
- requirement clarity;
- entity-link confidence;
- evidence coverage;
- model agreement/disagreement;
- score distance from decision bands;
- out-of-distribution/scope detection.

If lexical, dense, and structured signals strongly disagree, lower confidence and require review instead of averaging the disagreement away.

## 8.6 Governance

Employment screening is a consequential use. EEOC guidance states selection procedures should be job-related, validated for their intended positions and purposes, updated with job requirements, and evaluated for adverse impact. NYC’s AEDT rules may require bias audit, publication, and notices when the legal definition applies. The EU AI Act classifies certain recruitment systems as high-risk and emphasizes risk management, data governance, records, transparency, human oversight, accuracy, and security. This blueprint is engineering guidance, not legal advice; deployment requires jurisdiction-specific counsel. Sources: [EEOC selection procedures](https://www.eeoc.gov/laws/guidance/employment-tests-and-selection-procedures), [NYC AEDT](https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page), [EU AI Act](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32024R1689), [NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework).

**Non-negotiable controls**

- no protected attributes or obvious proxies as ranking inputs;
- no face, photo, name, address, age, graduation-year, gender, nationality, disability, or emotion inference;
- role-specific validation;
- adverse-impact and slice monitoring where lawful data collection permits;
- human review and documented override;
- appeal/correction process for real deployments;
- model/data cards and change control;
- immutable decision evidence;
- retention and deletion.

---

# 9. Target production architecture

## 9.1 Logical architecture

```text
                         PUBLIC INTERNET
                               |
                    [Nginx / Traefik + TLS]
                               |
              +----------------+----------------+
              |                                 |
       [Static web app]                  [FastAPI API v1]
                                                |
                 +------------------------------+------------------+
                 |              |                |                 |
          [PostgreSQL]       [Redis]       [Object storage]   [Job queue]
          + pgvector          cache          quarantine           |
          + full text         rate state      reports              |
                 |                                                 |
                 |                                   +-------------+----------+
                 |                                   |                        |
           [Search layer]                      [Parser workers]        [ML workers]
           PostgreSQL MVP                      sandboxed               embeddings
           OpenSearch later                    OCR/layout              reranking
                 |                                   |                        |
                 +-------------------------+---------+------------------------+
                                           |
                                 [Evidence + report service]
                                           |
                              [Metrics / logs / traces / audit]
```

## 9.2 Deployment-unit recommendation

### MVP: modular monolith with independent workers

- one FastAPI application with domain modules;
- one or more parser worker processes;
- one or more inference worker processes;
- PostgreSQL;
- Redis;
- object storage;
- reverse proxy;
- frontend.

This provides independent scaling for CPU-heavy tasks without network calls between every domain operation.

### Extract services only when triggered

| Trigger | Extracted service |
|---|---|
| Parsing backlog dominates or security isolation needs separate hosts | Parser service |
| GPU/CPU model lifecycle differs from API | Model inference service |
| Search corpus and operational ownership grow materially | Search service |
| Report rendering blocks workers | Report service |
| Independent teams/release cadence exist | Corresponding bounded context |

Microservices before these triggers add distributed transactions, network failure, version coordination, observability, and deployment cost without product benefit.

## 9.3 Domain modules

- `ingestion`: upload admission, quarantine, storage, job creation;
- `parsing`: extraction, OCR, layout, fields, confidence;
- `ontology`: canonical skills, aliases, versions, curation;
- `jobs`: JD parsing and calibration;
- `matching`: retrieval, reranking, aggregation, calibration;
- `reports`: recruiter and candidate views/exports;
- `history`: anonymous session TTL, run retrieval, deletion;
- `analytics`: product and model-quality events without raw PII;
- `governance`: audit, versions, evaluation, configuration.

## 9.4 Technology decisions

| Layer | Recommendation | Alternatives | Decision reason |
|---|---|---|---|
| Frontend | Existing React + TanStack + TypeScript + Tailwind/Radix | Next.js, Vue | Current stack is capable; avoid rewrite |
| API | FastAPI + Pydantic | Django Ninja | Strong typed API and async I/O; existing fit |
| ORM/migrations | SQLAlchemy 2 + Alembic | SQLModel | Mature explicit mappings and migrations |
| Primary DB | PostgreSQL | — | Relational integrity, JSONB, full text, extensions |
| Vector | pgvector first | Qdrant, OpenSearch | Simplest operational footprint to 10k+ |
| Cache/broker | Redis-compatible open-source deployment | RabbitMQ for broker | Cache, progress, locks; RabbitMQ if queue durability/complex routing dominates |
| Jobs | Celery | Dramatiq, RQ | Mature retries, routing, scheduling; tasks must be idempotent |
| Files | MinIO-compatible S3 storage | local volumes for dev | Quarantine, lifecycle, signed access |
| Malware | ClamAV | commercial scanners excluded | OSS signature scanning; not sufficient alone |
| Models | Sentence Transformers/Transformers + ONNX Runtime | PyTorch direct | Local inference and CPU quantization |
| Search later | OpenSearch | Qdrant | Boolean, facets, analyzers, hybrid |
| Reports | WeasyPrint or ReportLab | Playwright print | Deterministic local output |
| Observability | OpenTelemetry + Prometheus + Grafana + Loki/Tempo | — | Metrics, logs, traces without vendor lock-in |
| Proxy | Nginx or Traefik | Caddy | TLS, limits, routing |
| CI/CD | GitHub Actions + Trivy + Syft/Grype | Woodpecker/Jenkins | Fits user’s GitHub; OSS scanners |

FastAPI supports modular routers and multiple worker processes; CPU-heavy parsing/inference must still be moved out of request workers. In container orchestrators, a single API process per container is generally simpler, while a single-server Compose deployment may use several Uvicorn workers. Sources: [FastAPI bigger applications](https://fastapi.tiangolo.com/tutorial/bigger-applications/), [FastAPI server workers](https://fastapi.tiangolo.com/deployment/server-workers/), [FastAPI containers](https://fastapi.tiangolo.com/deployment/docker/).

## 9.5 Reliability contracts

- every upload creates an idempotency key and immutable job ID;
- jobs are at-least-once and handlers are idempotent;
- stage output is checkpointed;
- retries classify transient vs permanent failures;
- poison documents move to quarantine/dead-letter review;
- timeouts exist per page, document, embedding batch, and report;
- model loading occurs in dedicated workers, not every API worker;
- results are written transactionally before completion event;
- cancellation and deletion propagate to queued jobs and stored artifacts.

## 9.6 Showcase vs real enterprise mode

| Concern | Public showcase | Enterprise deployment |
|---|---|---|
| Identity | Anonymous signed session cookie | SSO/OIDC, RBAC, tenant isolation |
| Data retention | Short TTL, visible deletion | Tenant policy, legal hold, regional controls |
| History | Current browser session | Durable per tenant/user |
| Integrations | None / download only | ATS/HRIS APIs, webhooks |
| Audit | System and anonymous run audit | User/tenant action audit |
| Scale | Single host Compose | Replicas, managed/self-hosted cluster |
| Security | Strict public upload controls | Same plus tenant policy and private network |

---

# 10. Frontend and interaction architecture

## 10.1 Route map

```text
/                         Public landing page
/review                   Resume-only review
/match                    One resume vs one JD
/desktop/rank             Multiple resumes vs one JD
/desktop/compare-roles    One resume vs multiple JDs
/result/:runToken         Session-scoped result
/privacy                  Processing and retention policy
/architecture             Technical showcase
```

Opening `/` must never depend on backend availability. If the API is unavailable, the landing page still renders and demo actions explain the service status.

## 10.2 Component model

- `UploadDropzone`: file admission messaging, keyboard input, progress, cancellation.
- `DocumentPreview`: source page/text and parse warnings.
- `RequirementCalibrator`: required/preferred/equivalent/ignore.
- `ProcessingTimeline`: real server stages using polling or server-sent events.
- `FitSummary`: fit band, evidence coverage, confidence, limitations.
- `EvidenceCard`: criterion, status, source passage, normalization, impact.
- `CandidateCompare`: aligned criteria, not arbitrary profile cards.
- `BatchJobPanel`: per-file status, retry, partial success.
- `ExportDialog`: purpose, content, privacy warning, expiration.

## 10.3 State strategy

Use server state as the source of truth:

- TanStack Query for API/server cache;
- local component state for presentation;
- URL-safe mode and filter state where shareable;
- server-sent events for progress, with polling fallback;
- resumable result token stored in session storage;
- no global state library until a demonstrated need.

## 10.4 Design system

| Token | White mode | Dark mode |
|---|---|---|
| Page | cool near-white | near-black blue |
| Surface | white | raised neutral |
| Text | near-black navy | near-white |
| Primary | professional blue | lighter blue |
| Success/verified | restrained green | accessible green |
| Warning | amber | amber |
| Danger | red | red |
| Analysis animation | blue/cyan with small green completion states | same semantics, tuned contrast |

The global theme owns all child surfaces. A screening component must not force black inside white mode. Green indicates completion/verified state; it is not the universal brand background.

## 10.5 Charts and comparisons

Use:

- stacked evidence-coverage bars;
- required/preferred matrices;
- compact distribution plots for batch ranks;
- criterion-by-candidate table;
- confidence and parse warnings as badges/text.

Avoid:

- speedometers;
- decorative radar charts as primary explanation;
- pie charts for many skills;
- red/green-only judgments;
- animated numbers pretending to calculate.

## 10.6 Loading, errors, and empty states

| State | Required response |
|---|---|
| Backend offline | Landing remains usable; action shows service unavailable and retry |
| Unsupported file | Explain allowed formats and detected type |
| Scanned PDF | “OCR required,” page progress, expected slower processing |
| Partial parse | Show extracted content and warning; allow correction |
| Batch partial failure | Preserve successes; retry failed files only |
| No JD | Route to resume review, not an error |
| Non-IT resume | Explain scope; allow one review request if classifier uncertain |
| No match evidence | “Insufficient evidence,” not zero qualification |
| Session expired | Explain deletion and offer a new review |

## 10.7 Accessibility and quality

- semantic headings/landmarks and visible focus;
- full keyboard support for dropzone, tabs, calibrator, evidence expansion;
- WCAG 2.2 AA contrast;
- status announcements and error summaries;
- localization-safe layouts;
- reduced motion;
- 200% zoom and reflow;
- high-contrast print/export;
- Playwright accessibility smoke checks plus manual screen-reader testing.

## 10.8 Performance budgets

Engineering targets:

- landing HTML/CSS shell visible without API;
- initial public route JavaScript ≤ 200–250 KB compressed where practical;
- lazy-load charts, PDF preview, advanced desktop flows, and model diagrams;
- image formats AVIF/WebP with explicit dimensions;
- virtualize candidate lists beyond ~100 rows;
- stream batch status rather than refetching complete results;
- do not transmit raw embeddings or unnecessary resume text to the client.

---

# 11. Backend design

## 11.1 Layered boundaries

```text
API adapters
   -> application use cases
       -> domain policies
           -> ports/interfaces
               -> persistence, queue, storage, model, parser adapters
```

Routes validate transport and invoke a use case. They do not parse documents, calculate scores, or directly compose database queries. Domain services do not import FastAPI.

## 11.2 Recommended modules

```text
app/
  api/v1/
  application/
  domain/
    documents/
    jobs/
    ontology/
    matching/
    reports/
    governance/
  infrastructure/
    db/
    cache/
    queue/
    storage/
    parsers/
    models/
  workers/
  observability/
```

This is a conceptual structure, not a mandate to rewrite working code at once.

## 11.3 API design

- version all public endpoints under `/api/v1`;
- use resource/job semantics for long operations;
- return `202 Accepted` with a run/job token for parsing and batch matching;
- expose stage, progress, warnings, and retryability;
- use idempotency keys for upload/match creation;
- cursor pagination for history/candidates;
- stable machine-readable error codes plus human messages;
- OpenAPI schema and generated TypeScript client;
- explicit API deprecation policy.

### Conceptual API surface

| Resource | Operations |
|---|---|
| health/readiness | liveness, DB/Redis/model readiness |
| documents | create, status, parse, preview, correction, delete |
| jobs | create JD, parse, calibrate requirements |
| reviews | resume-only review run and report |
| matches | one-to-one, one-to-many, many-to-one |
| batches | status, items, retry, cancel |
| ontology | search concepts, aliases, versions |
| reports | view, export, expire |
| configuration | published role profiles only |

## 11.4 Concurrency model

- API async I/O for database, cache, and object store;
- parser/OCR in worker processes with CPU/memory/time limits;
- embedding inference batched in dedicated workers;
- reranker concurrency capped to avoid memory exhaustion;
- database writes short and transactional;
- backpressure based on queue depth;
- fair per-session admission to prevent one batch consuming all workers.

Do not use FastAPI `BackgroundTasks` for durable parsing. A process restart would lose work. Use the queue.

## 11.5 Caching

| Cache key | Safe basis | TTL/invalidation |
|---|---|---|
| Parsed document | content hash + parser version + config | expires with source policy; invalidate on parser change |
| Embedding | normalized text hash + model/revision + pooling | long-lived while legally retained |
| JD calibration | JD hash + ontology/profile version | invalidate on recruiter edit |
| Match | resume parse + JD calibration + model/profile versions | immutable result or explicit rerun |
| Ontology lookup | ontology version + term | release-based invalidation |

Never key by filename alone. Encrypt or avoid cached PII. Redis is not the system of record.

## 11.6 Repository and transaction policy

- repositories encapsulate persistence for aggregates, not every table;
- application unit-of-work controls transactions;
- use optimistic versioning on corrected parses and calibration;
- outbox table publishes completion/audit events after commit;
- use read models/materialized views for analytics rather than complex writes into JSON blobs.

## 11.7 Configuration governance

Settings fall into three classes:

1. **Runtime:** limits, queue, storage, feature flags—environment/config.
2. **Model/profile:** versioned and published in database; immutable per run.
3. **Recruiter calibration:** per-JD criteria with explicit audit.

Public slider changes must not silently affect every future scan. Publishing a new profile requires validation, changelog, and rollback.

---

# 12. Database and data contracts

## 12.1 Core relational model

```text
anonymous_session 1---* document
document          1---* document_version
document_version  1---* page
document_version  1---* section
document_version  1---* extracted_entity
document_version  1---* experience
document_version  1---* project
document_version  1---* education
document_version  1---* certification

skill_concept     1---* skill_alias
skill_concept     *---* skill_relation
skill_concept     1---* skill_evidence
document_version  1---* skill_evidence

job_description   1---* jd_version
jd_version        1---* job_requirement
job_requirement   *---* skill_concept

match_run         1---* match_candidate
match_candidate   1---* criterion_result
criterion_result  1---* evidence_link

model_release     1---* match_run
ontology_release  1---* match_run
weight_profile    1---* match_run
parser_release    1---* document_version

match_run         1---1 report
match_run         1---* decision_event
all key resources 1---* audit_event
```

## 12.2 Table blueprint

### Sessions and privacy

| Table | Key fields |
|---|---|
| `anonymous_session` | id, hashed token, created, last_seen, expires, consent/notice version |
| `deletion_request` | resource scope, requested, completed, status |
| `retention_policy` | artifact type, TTL, effective version |

User and organization tables are omitted from showcase mode. If enterprise authentication is later added, introduce tenant-scoped `organization`, `user`, `role`, and membership tables without changing evidence ownership semantics.

### Documents

| Table | Key fields |
|---|---|
| `document` | id, session, kind, safe display name, content hash, MIME, size, status, source object key, expiry |
| `document_version` | id, document, parser release, language, page count, native/OCR flags, parse confidence, created |
| `document_page` | version, page number, dimensions, text, OCR metadata, confidence |
| `document_section` | version, canonical type, label, order, page/span/bbox, confidence |
| `extracted_entity` | version, entity type, raw/canonical value, source span, method, confidence |
| `parse_correction` | version, target field, old/new values, reason, created, derived version |

### Resume profile

| Table | Key fields |
|---|---|
| `resume_profile` | document version, role family, seniority evidence, summary, scope classification |
| `experience` | profile, title raw/canonical, company encrypted/display policy, dates, current, source, confidence |
| `experience_interval` | experience, start/end precision, overlap group |
| `project` | profile, name, description, dates, URL, source |
| `education` | profile, degree/field/institution, dates, source, confidence |
| `certification` | profile, concept/issuer, credential ID encrypted, dates/expiry, source |
| `profile_link` | type, normalized URL, display URL, source |

### Ontology

| Table | Key fields |
|---|---|
| `ontology_release` | version, status, source licenses, checksum, published |
| `skill_concept` | stable ID, release, preferred label, category, definition, lifecycle |
| `skill_alias` | concept, alias, language, match mode, ambiguity rule |
| `skill_relation` | source concept, target concept, relation type, strength, rationale |
| `role_family` | stable ID, name, supported flag, description |
| `role_skill_prior` | role family, concept, typical relevance, evidence expectation—not a hiring gate |
| `skill_evidence` | profile, concept, surface, section/span, evidence type, context, dates, confidence |

### Jobs and calibration

| Table | Key fields |
|---|---|
| `job_description` | id, session, safe title, status, created, expiry |
| `jd_version` | job, source document/text hash, parser/ontology release, role family, created |
| `job_requirement` | version, atomic text, type, priority, hard gate flag, recruiter confirmed, source |
| `requirement_concept` | requirement, concept, relation, acceptable equivalent flag |
| `job_calibration` | jd version, revision, published, notes, profile version |

### Matching and evidence

| Table | Key fields |
|---|---|
| `match_run` | id, type, JD/calibration, all release IDs, status, timestamps, idempotency key |
| `match_candidate` | run, resume version, rank, fit band, alignment index nullable, confidence, warning flags |
| `retrieval_result` | candidate, retriever, item/span, raw score, rank, fused rank |
| `criterion_result` | candidate, requirement, status, contribution, evidence strength, confidence |
| `evidence_link` | criterion result, source table/id, page/span/bbox, relation, excerpt checksum |
| `score_component` | candidate, named feature, raw, normalized, contribution, explanation |
| `decision_event` | candidate, action, reason code, note, actor/session, created |
| `report` | run, audience, object key, checksum, expiry |

### Models and operations

| Table | Key fields |
|---|---|
| `model_release` | task, model ID, upstream revision hash, license, artifact checksum, runtime, evaluation |
| `weight_profile` | name, role family, version, component config, status, validation report |
| `parser_release` | version, component versions, checksum, evaluation |
| `job_execution` | queue ID, type, status, attempts, stage, progress, errors, timing |
| `audit_event` | actor/session, action, resource, timestamp, request correlation, metadata |
| `analytics_event` | non-PII event type, dimensions, duration, success/failure |

## 12.3 Storage rules

- relational columns for fields used in filters, constraints, joins, and governance;
- JSONB only for bounded model diagnostics or forward-compatible metadata;
- vector column keyed by text hash, model release, and representation type;
- source text encrypted where retained;
- raw files in object storage, never database blobs;
- immutable result/config version references;
- partition audit/analytics by date at scale;
- indexes on session/expiry, status, hashes, foreign keys, canonical skill, role, dates, and match run.

## 12.4 Why current SQLite/JSON is insufficient

SQLite is appropriate for local demonstration. A production multi-process workload needs concurrent transactions, migrations, operational backups, row-level controls for future tenancy, robust indexing, and normalized evidence queries. A single JSON result cannot efficiently answer:

- which parser version produced a field;
- which evidence caused a score;
- how an ontology change alters rankings;
- which skills are systematically missed;
- whether a model regressed by role family;
- which artifacts must be deleted at TTL.

PostgreSQL becomes essential at MVP production hardening. SQLite may remain for offline developer/demo mode.

---

# 13. Performance and scale

## 13.1 Performance principles

1. Hash and deduplicate before expensive work.
2. Extract/OCR each document once per parser version.
3. Embed each normalized chunk once per model version.
4. Batch model inference.
5. Retrieve a shortlist before cross-encoding.
6. Use selective OCR, not OCR for every PDF.
7. Separate interactive API latency from background throughput.
8. Measure recall as well as query speed.
9. Apply backpressure and bounded queues.
10. Benchmark with the actual resume distribution.

## 13.2 Engineering service-level objectives

These are target budgets to validate on designated hardware, **not claimed benchmarks**:

| Operation | Target |
|---|---:|
| Landing route | p75 LCP < 2.5 s on typical mobile network |
| Upload admission response | p95 < 500 ms after transfer |
| Cached native-text resume review | p95 < 2 s |
| Native PDF/DOCX extraction | p95 < 2 s per typical resume |
| OCR page | p95 < 8–12 s CPU, hardware/language dependent |
| Single 1:1 match after cached parse | p95 < 3 s CPU with small reranker |
| Interactive corpus retrieval | p95 < 750 ms at 10k profiles |
| Top-50 cross-encoder rerank | p95 < 2 s on validated CPU/accelerator |
| Progress update freshness | < 2 s |
| Error-free batch recovery | retry only failed items; no duplicate outputs |

## 13.3 Capacity tiers

| Corpus/batch | Suggested topology | Ingestion strategy | Search |
|---|---|---|---|
| 100 resumes | 4–8 vCPU, 16 GB RAM, single host | 2–4 parser workers, small embedding batches | PostgreSQL exact/full text; exact vector may suffice |
| 1,000 resumes | 8–16 vCPU, 32 GB, optional inference GPU | queue, 4–8 parser workers, batched embedding, OCR pool | PostgreSQL + pgvector HNSW after recall test |
| 10,000 resumes | 16–32 vCPU, 64 GB or split workers | worker autoscaling, object storage, separate OCR/inference queues | pgvector or OpenSearch based on Boolean/facet needs |
| 100,000+ profiles | distributed deployment | incremental indexing, replicas, dedicated inference | OpenSearch hybrid or Qdrant + text engine; measured sharding |

### Indicative batch completion budgets

Assuming two-page resumes, mostly native text:

- 100: approximately 2–5 minutes;
- 1,000: approximately 10–30 minutes;
- 10,000: approximately 30–120 minutes.

OCR-heavy corpora can be many times slower. These ranges must be replaced by measured throughput from the target CPU, model, page mix, and queue configuration.

## 13.4 Embedding and reranking optimization

- pre-split by semantic section and keep chunks small enough to preserve evidence;
- encode in batches sized by measured memory/latency;
- ONNX Runtime/OpenVINO INT8 for validated CPU deployment;
- normalize once if using cosine/inner product convention;
- cache by normalized text and exact model revision;
- use small English embedding model for MVP;
- retrieve 50–200 candidates/evidence spans;
- rerank only top 20–50 depending evaluation;
- quantization allowed only after nDCG/recall regression checks.

## 13.5 Vector index choice

| Index | Build/memory | Query/recall | Use |
|---|---|---|---|
| Exact | No ANN index | Highest recall, slower as corpus grows | Up to small datasets and evaluation truth |
| HNSW | Higher build time/memory | Strong speed/recall | Default after corpus is populated and benchmarked |
| IVFFlat | Faster build, less memory | More tuning and lower speed/recall tradeoff | Large bulk-loaded corpora with controlled probes |

Monitor ANN recall by comparing sampled results to exact search; the pgvector documentation explicitly recommends this. Do not optimize latency while silently losing relevant candidates. [pgvector performance and monitoring](https://github.com/pgvector/pgvector).

## 13.6 Cache and invalidation impact

The major latency win is reuse:

```text
document content hash
  + parser release
  -> parsed profile

section text hash
  + model revision
  -> embedding

parsed profile ID
  + calibrated JD ID
  + ontology/model/profile releases
  -> immutable match result
```

Any component change creates a new version; it does not mutate historical decisions.

## 13.7 Load-shedding

- per-IP/session upload and concurrency quotas;
- batch-size and total-page caps;
- OCR queue isolation;
- reject new batch jobs with retry guidance when saturated;
- preserve single-review capacity;
- priority queues for interactive vs bulk;
- memory circuit breakers around model workers;
- request/body limits at reverse proxy and API.

---

# 14. Security, privacy, and abuse resistance

## 14.1 Threat model

Uploaded resumes and JDs are hostile input. Threats include:

- spoofed MIME/extensions;
- malicious PDF objects, decompression bombs, huge dimensions/pages;
- DOCX zip bombs, path traversal, external relationships, macros/embedded objects;
- parser vulnerabilities;
- malware;
- formula/script content in downstream exports;
- prompt/instruction text targeting optional LLM stages;
- denial of service through OCR/model load;
- PII exposure through logs, URLs, caches, reports, analytics, or stale storage;
- cross-session object access;
- supply-chain compromise of models/packages/containers.

## 14.2 Secure upload pipeline

```text
Reverse-proxy limits
  -> extension allowlist
  -> server-side MIME and magic signature
  -> random object name
  -> quarantine bucket
  -> size/page/dimension/archive limits
  -> ClamAV
  -> isolated parser with no network, read-only root, temp quota, timeout
  -> content sanitization / safe derived representation
  -> accepted object with lifecycle policy
```

OWASP recommends allowlisting required extensions, treating client content type as untrusted, validating signatures/content, generating filenames, limiting sizes, storing outside the webroot/on a separate server, and using antivirus, sandboxing, or content-disarm/reconstruction where applicable. [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

## 14.3 Format-specific controls

### PDF

- maximum bytes, pages, objects, streams, rendered pixels, and extraction time;
- reject encrypted/password-protected files unless a deliberately designed flow exists;
- disable or strip JavaScript, launch actions, attachments, external references, and forms from derived outputs;
- render/OCR in a sandbox with no network;
- never serve original PDF inline from the application origin without safe content disposition and policy.

### DOCX

- treat as ZIP; validate central directory before expansion;
- expansion ratio, file count, depth, and uncompressed-size limits;
- reject macros (`.docm`) and embedded executables;
- block external relationships and remote templates;
- prevent archive path traversal;
- parse XML with hardened libraries and entity expansion disabled;
- create a safe text/preview derivative rather than rendering arbitrary office content in the API.

### TXT

- strict byte limit and encoding detection;
- normalize control characters;
- escape content in HTML, logs, CSV, and reports.

## 14.4 Sandboxing

Parser containers/processes should have:

- dedicated unprivileged UID;
- read-only root filesystem;
- no outbound network;
- no Docker socket or host mounts;
- limited CPU, memory, PIDs, file descriptors, temp bytes, and wall time;
- seccomp/AppArmor/SELinux profile;
- ephemeral workspace destroyed after completion;
- patched, minimal base image.

ClamAV is a defense layer, not proof of safety; signatures miss unknown parser exploits.

## 14.5 Application security

- strict Pydantic schemas and bounded strings/lists;
- parameterized SQL/ORM;
- CSRF defense for cookie-bound mutation;
- secure, `HttpOnly`, `SameSite`, short-lived session cookies;
- cryptographically random unguessable run tokens;
- object authorization on every access despite anonymous mode;
- CORS limited to deployed frontend;
- CSP, HSTS, frame protections, MIME sniffing protection;
- rate limits and quotas at proxy plus application;
- output encoding and safe Markdown rendering;
- no stack traces or model internals to clients;
- secret management, rotation, and least privilege;
- dependency lock files, SBOM, image signing, vulnerability scanning.

## 14.6 Privacy

Resumes contain direct identifiers and sensitive inferences. Default showcase policy:

- process only for the requested demo;
- no model training from uploads;
- no external AI/model API;
- short, visible TTL (for example, 60 minutes or 24 hours after explicit notice);
- immediate delete action;
- originals and derived artifacts deleted together;
- analytics contain no raw resume/JD text or contact identifiers;
- logs redact filenames, text, email, phone, URLs, and signed tokens;
- encryption in transit and at rest;
- backup lifecycle aligned with deletion disclosure.

“Local models” means local to the deployed server, not necessarily the visitor’s device. The landing page must say this accurately.

## 14.7 Optional generative-model safety

If a local LLM is introduced later:

- resume and JD text are data, never system instructions;
- constrained structured output with schema validation;
- only summarize retrieved source evidence;
- attach citations to every generated statement;
- no score generation, automatic rejection, protected-trait inference, or ungrounded recommendations;
- adversarial prompt-injection tests;
- deterministic fallback when generation fails.

## 14.8 Security release gates

| Gate | MVP |
|---|---|
| File admission/magic/limits | Required |
| Quarantine and ClamAV | Required |
| Isolated no-network parser | Required |
| Dependency/container scan and SBOM | Required |
| Secret scan and protected CI variables | Required |
| Rate/concurrency quotas | Required |
| PII log tests | Required |
| Retention/deletion verification | Required |
| External penetration test | Before real candidate data at meaningful scale |
| CDR | V2/enterprise based on risk |

---

# 15. Testing, evaluation, and release quality

## 15.1 Test pyramid

| Layer | Scope | Examples |
|---|---|---|
| Unit | Deterministic domain behavior | date intervals, aliases, negation, gates, score aggregation, retention |
| Property/fuzz | Parser and input invariants | malformed PDFs/DOCX, Unicode, archive paths, limits |
| Contract | API/worker/schema compatibility | OpenAPI, events, job payload versions, model response schema |
| Integration | Real dependencies | PostgreSQL, Redis, object storage, ClamAV, parser sandbox |
| Golden-document | Stable parse expectations | multi-column, tables, hyperlinks, OCR, unusual headings |
| Retrieval/ranking | Relevance quality | Recall@K, nDCG@K, MRR, pairwise accuracy |
| Calibration | Score meaning | Brier score, ECE, reliability by role family |
| End-to-end | Complete user flows | review, 1:1 match, batch partial failure, delete |
| Accessibility | Keyboard/screen reader/contrast/reflow | automated checks plus manual |
| Performance | load, soak, stress, spike | API, workers, batch, queue recovery |
| Security | SAST/SCA/DAST/upload adversarial | malicious formats, IDOR, rate bypass, PII logs |
| Fairness/governance | slices and counterfactuals | rank stability after PII masking; adverse-impact analysis |

## 15.2 Gold evaluation corpus

Create a consented, de-identified evaluation set:

- all supported IT role families;
- fresher, mid, senior, staff/lead, and career-transition profiles;
- single/multi-column, tables, OCR, DOCX, and TXT;
- conventional and unconventional titles;
- project-heavy and experience-heavy resumes;
- multiple English varieties; multilingual only if claimed;
- ambiguous and negative skill statements;
- honest near-duplicate and keyword-stuffed cases;
- clear non-IT and adjacent-IT scope examples.

Keep a hidden final test set. Synthetic resumes can test edge cases but cannot be the only accuracy evidence.

## 15.3 Annotation design

At least two qualified technical recruiters/engineering reviewers should label:

- section/field spans;
- canonical skills and evidence types;
- atomic JD requirements;
- acceptable equivalents;
- requirement-to-evidence relevance;
- pairwise candidate preference for the specific role;
- confidence and adjudication notes.

Measure inter-annotator agreement. Disagreement is product information: the UI should expose uncertainty rather than force a model to “resolve” inherently subjective criteria.

## 15.4 Metrics

### Parsing

- exact/relaxed field precision, recall, F1;
- section boundary F1;
- chronology/date interval accuracy;
- link extraction accuracy;
- OCR word error rate on labeled pages;
- percentage routed to human review;
- evidence-span exactness.

### Skill/entity linking

- mention precision/recall;
- canonical concept accuracy;
- exact vs equivalent classification;
- ambiguity and negation accuracy;
- performance by section, role family, and emerging technology.

### Retrieval and ranking

- Recall@20/50/100;
- nDCG@5/10;
- MRR;
- pairwise agreement with adjudicated judgments;
- required-criterion coverage error;
- zero-result and insufficient-evidence rate;
- ANN recall vs exact retrieval.

### Calibration and UX

- Brier score/ECE;
- confidence reliability by role family;
- recruiter time to evidence;
- correction rate;
- override rate with reasons;
- task completion/error rate;
- false confidence rate.

## 15.5 ATS comparison protocol

Do not claim “better than Greenhouse/Workday” without an accessible, lawful, repeatable test. Compare observable outcomes:

1. upload the same consented documents where product terms permit;
2. compare extracted fields and searchable text;
3. compare retrieval for predefined Boolean/skill queries;
4. compare evidence usability, not inaccessible proprietary score formulas;
5. record configuration, date, version, and reviewer;
6. publish limitations.

## 15.6 Regression gates

A release is blocked if:

- any supported role family drops beyond the agreed nDCG/Recall tolerance;
- parse F1 or OCR routing regresses materially;
- calibration worsens;
- a new ontology alias causes unacceptable false matches;
- PII appears in logs/analytics;
- deletion leaves source or derivative artifacts;
- model artifact/license/revision is unpinned;
- high-severity security issue remains;
- accessibility core flow fails.

## 15.7 Load and resilience scenarios

- 100 simultaneous small uploads;
- 10 users each submit 1,000-resume batches;
- 30% OCR documents;
- Redis restart and redelivery;
- worker crash mid-parse;
- database failover/read-only period;
- model worker out of memory;
- object storage timeout;
- duplicate idempotency request;
- cancellation and deletion while queued/running;
- poisoned document repeatedly failing.

---

# 16. Open-source deployment

## 16.1 Recommended environments

### Local development

Docker Compose:

- web dev server;
- FastAPI API;
- parser worker;
- ML worker;
- PostgreSQL + pgvector;
- Redis;
- MinIO-compatible storage;
- ClamAV;
- optional observability profile.

### Public showcase production

One Linux VM can host containers behind Nginx/Traefik if resources are bounded:

```text
Internet
  -> TLS reverse proxy
     -> static frontend
     -> API replicas/processes
        -> PostgreSQL
        -> Redis
        -> MinIO storage
        -> parser/ML workers
        -> ClamAV
```

Use persistent encrypted volumes, automated backups, health checks, restart policies, and an off-host monitoring/backup path where possible. A free backend host may sleep, restrict CPU/RAM, cap request duration, or lack persistent disk; OCR and local models frequently exceed free-tier constraints. A public showcase can use free static frontend hosting, but production-like backend/model processing generally needs an always-on Linux host with enough memory.

### Enterprise

- separate private subnets/nodes for API, workers, data, and observability;
- PostgreSQL primary/replica and tested restore;
- Redis/RabbitMQ durability appropriate to queue policy;
- object-store replication/lifecycle;
- container orchestration only when operational maturity warrants it;
- tenant isolation, SSO, secrets manager, egress policy, regional data controls.

## 16.2 CI/CD stages

```text
Pull request
  -> formatting/lint/type checks
  -> unit + contract tests
  -> parser golden tests
  -> frontend component/E2E smoke
  -> SAST + dependency/license + secret scan
  -> build reproducible images
  -> SBOM + vulnerability scan
  -> integration environment
  -> accuracy regression suite
  -> signed artifact
  -> manual production approval
  -> migration + deploy
  -> smoke/canary
  -> rollback if SLO/quality gate fails
```

GitHub Actions is appropriate because the project already uses GitHub, but workflows must pin action revisions, minimize token permissions, protect environments, and never download unverified model artifacts during production startup.

## 16.3 Model artifact delivery

- approve a model ID, immutable revision, license, checksum, and evaluation report;
- mirror artifacts into controlled object/package storage;
- scan serialized formats and prefer `safetensors`/ONNX;
- build or preload images/artifacts before deploy;
- warm the model worker and verify readiness;
- canary model release by explicit profile/version;
- retain previous artifact for rollback.

## 16.4 Database and backup

- Alembic migrations reviewed and tested on production-like data;
- backward-compatible expand/migrate/contract changes;
- PostgreSQL point-in-time recovery where required;
- encrypted backups and quarterly restore exercises;
- database/vector index maintenance;
- retention deletion reflected in backups according to published policy;
- no SQLite database on ephemeral production disk.

## 16.5 Observability

### Metrics

- request rate/error/latency;
- upload bytes and rejection reason;
- queue depth/age/retry/dead-letter;
- parser duration by format/OCR;
- model batch size/latency/memory;
- match latency and candidate count;
- cache hit rate;
- database pool/queries/index recall samples;
- deletion lag;
- parse confidence and review rate;
- quality metrics by release, without raw PII.

### Traces

Correlate upload → job → parser → embedding → match → report using a non-PII trace/run ID.

### Logs

Structured JSON, severity, component, release, trace, safe error code; no resume text, JD text, filename, contact data, signed URL, cookie, or model input.

Prometheus rules feed Alertmanager for operational alert routing. [Prometheus alerting](https://prometheus.io/docs/alerting/latest/overview/).

## 16.6 Deployment decision matrix

| Option | Pros | Cons | Recommendation |
|---|---|---|---|
| Single-host Compose | Lowest cost/complexity; ideal showcase | Limited HA; vertical scale | MVP/public showcase |
| Docker Swarm | Modest orchestration | Smaller ecosystem/skills pool | Not necessary |
| Kubernetes | Strong scheduling, isolation, autoscaling | Significant operational burden | Enterprise or measured scale trigger |
| Serverless functions | Cheap idle API | Poor fit for local models/OCR, time/memory limits | Frontend/API edge only, not processing |
| Static Vercel frontend + remote backend | Easy public web delivery | Cross-origin, cold/sleep backend, two operational planes | Acceptable demo if backend is truly persistent |

---

# 17. Open-source models and search technology

## 17.1 Model-selection principles

“Open source” must be verified at both code and model-weight levels. Record:

- license and commercial-use compatibility;
- model card and intended use;
- upstream immutable revision;
- architecture/parameter count/context;
- language coverage;
- CPU/GPU memory and latency;
- quantization support;
- domain evaluation;
- security implications such as remote custom code.

Public MTEB results help shortlist models; they do not validate hiring decisions.

## 17.2 Embedding comparison

| Family | Strengths | Weaknesses | Decision |
|---|---|---|---|
| MiniLM | Very fast, small, excellent baseline | Short context and older general retrieval quality | Keep as speed baseline; not default final model without winning benchmark |
| BGE small/base v1.5 | MIT, strong retrieval, sensible sizes, ONNX ecosystem | English-specific variants; instruction discipline required | **Recommended English MVP shortlist** |
| BGE-M3 | 100+ languages, up to 8192 tokens, dense+sparse+multi-vector | 1024 dimensions and substantially heavier compute/storage | **Recommended multilingual/V2 candidate** |
| E5 base/large | Mature asymmetric retrieval, broad ecosystem | Query/passages need correct prefixes; benchmark licensing/revision | **Strong English shortlist** |
| GTE ModernBERT | Modern long-context encoder, competitive retrieval | Larger/newer operational baseline | V2 benchmark candidate |
| Jina Embeddings v3 | Multilingual, long context, task adapters | Published model card is CC BY-NC 4.0 for on-premises use; unsuitable for unrestricted commercial production | Research/demo only unless a compatible license is obtained |
| Instructor XL | Apache-2.0 and flexible instructions | Approximately 5 GB checkpoint, slow/expensive for this need | Avoid for MVP |

BGE small v1.5 is MIT-licensed and its model card permits commercial use. BGE-M3 supports multilingual, dense, sparse, and multi-vector retrieval up to 8192 tokens. Jina v3’s model card lists CC BY-NC 4.0 for on-premises use, so “free download” is not enough for the project’s production objective. Sources: [BGE small v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5), [BGE-M3](https://huggingface.co/BAAI/bge-m3), [Jina Embeddings v3](https://huggingface.co/jinaai/jina-embeddings-v3), [Instructor XL](https://huggingface.co/hkunlp/instructor-xl).

### Recommended benchmark finalists

1. `BAAI/bge-small-en-v1.5`—CPU/cost default candidate.
2. `intfloat/e5-base-v2`—quality/size comparison.
3. existing MiniLM—latency baseline.
4. `BAAI/bge-m3`—only for multilingual/long-context requirement and suitable hardware.

## 17.3 Reranker comparison

| Model | Cost | Fit |
|---|---:|---|
| `cross-encoder/ms-marco-MiniLM-L-6-v2` | Small/CPU-friendly | MVP reranker benchmark; Apache-2.0 |
| BGE reranker base | Moderate | Higher-quality English/Chinese candidate |
| BGE reranker v2-m3 | High (568M class) | Multilingual/GPU or carefully optimized CPU |
| ColBERT late interaction | Higher index/complexity | Future large-corpus evidence reranking |

The small MS MARCO MiniLM cross-encoder is Apache-2.0 and available in ONNX/OpenVINO forms. [Model card](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L-6-v2).

## 17.4 NLP libraries

| Tool | Use | Decision |
|---|---|---|
| spaCy | tokenization, rules, custom NER, sentence boundaries | Use |
| RapidFuzz | conservative alias/misspelling candidates | Use |
| NLTK | research utilities/lexical resources | Optional; not core runtime |
| Sentence Transformers | bi/cross-encoder loading, training, evaluation | Use |
| Transformers | model/runtime substrate | Use with pinned revisions |
| ONNX Runtime/OpenVINO | CPU inference and quantization | Use after accuracy validation |

## 17.5 Search/vector comparison

| Technology | Full text | Vector | Filters | Operations | Recommendation |
|---|---|---|---|---|---|
| PostgreSQL + pgvector | Good | Exact/HNSW/IVFFlat | Excellent relational | Low | MVP |
| OpenSearch | Excellent Boolean/facets | Hybrid/ANN | Excellent | Medium/high | Scale/search V2 |
| Qdrant | Limited text; strong sparse vectors | Excellent | Strong | Medium | Vector-centric alternative |
| FAISS | No | Excellent library | Application-managed | Low for offline, high for serving | Offline benchmark |
| Milvus | No native ATS text focus | Distributed vector | Strong | High | Only very large vector scale |
| Chroma | Basic | Prototype-friendly | Basic | Low | Prototype only |
| Whoosh | Embedded lexical | No | Limited | Low | Avoid production |

Qdrant’s official documentation supports dense+sparse retrieval, RRF, and multistage reranking; it also notes it does not provide a built-in ontology or general non-vector ranking system. [Qdrant hybrid search](https://qdrant.tech/documentation/search/hybrid-queries/), [Qdrant fundamentals](https://qdrant.tech/documentation/faq/qdrant-fundamentals/).

## 17.6 Local generative models

| Family/runtime | Potential use | Risks/decision |
|---|---|---|
| Ollama | Easy local showcase runtime | Development convenience, not scoring architecture |
| vLLM | High-throughput GPU serving | Operational/GPU cost; use only when generation is proven necessary |
| Llama | Narrative/extractive assistant depending model license | Weight license is not conventional OSS; verify exact release |
| Mistral | Local summarization depending exact model/license | Verify exact artifact; not MVP |
| Qwen | Strong multilingual structured generation depending exact model | Verify exact release/license; later |
| Gemma | Efficient local models with custom terms | Not conventional open-source license; later if terms fit |

No generative model is needed for parsing, matching, or explanation. Template-driven, evidence-grounded explanations are faster and safer. A local LLM may later produce a readable decision brief from already selected evidence, with citations and schema validation, but it must never create the rank or infer missing facts.

## 17.7 Final model stack

**MVP**

- spaCy + deterministic rules for sections/entities;
- ontology alias/context matcher + RapidFuzz;
- BM25/PostgreSQL full text;
- BGE-small or E5-base embeddings selected on gold set;
- small MiniLM cross-encoder selected on gold set;
- ONNX Runtime where accuracy-equivalent;
- no generative LLM.

**V2**

- trained section/entity models;
- role-specific reranker fine-tuned on adjudicated pairs;
- BGE-M3 only if multilingual requirement;
- optional OpenSearch/Qdrant hybrid retrieval;
- local extractive/narrative model for cited report language.

---

# 18. Complete missing-feature inventory

## 18.1 Must have before “production-ready”

### Product and recruiter

- landing page as default route;
- no login or fake account state;
- JD requirement calibration;
- supported-role/scope boundary and abstention;
- parse preview/correction;
- evidence-linked results;
- required/preferred/equivalent distinction;
- human disposition and override;
- batch partial retry/cancel;
- duplicate detection;
- report with limitations and versions.

### Data and ML

- normalized evidence schema;
- canonical, versioned IT ontology;
- section-aware chunks;
- proper corpus BM25/full-text retrieval;
- RRF or evaluated score normalization;
- top-N cross-encoder reranking;
- removal of TF-IDF as a separately weighted production signal;
- removal of resume quality from job fit;
- calibration/evaluation suite;
- model, parser, ontology, and profile registry.

### Security/operations

- quarantine, scanning, parser sandbox;
- retention and deletion;
- rate/concurrency/batch limits;
- PostgreSQL and durable jobs;
- health/readiness and observability;
- pinned artifacts, SBOM, vulnerability scans;
- backup/restore and migration process.

## 18.2 Should have

- Boolean/visual search;
- candidate comparison by criterion;
- role-family templates;
- PII-blind first-pass review;
- ontology curator workflow;
- model-change shadow evaluation;
- saved anonymous result token within TTL;
- synthetic demo dataset;
- responsive mobile-only simple modes;
- accessibility verification;
- downloadable recruiter/candidate reports;
- evaluation dashboard and slice alerts.

## 18.3 Nice to have

- ATS integration adapters;
- candidate rediscovery;
- local cited narrative report;
- interview-question kit tied to evidence gaps;
- skill-market trend analytics from licensed/open data;
- multilingual parsing/matching;
- graph-based skill path visualization;
- candidate-controlled correction/appeal portal in real deployments.

## 18.4 Avoid

- automatic rejection;
- protected-attribute or personality inference;
- face/photo analysis;
- emotion/voice analysis;
- “culture fit” scoring;
- unexplained 0–100 qualification score;
- arbitrary public weight sliders;
- learning from historical hire labels without validation/bias controls;
- keyword-stuffing advice;
- claiming unsupported skill absence as fact;
- scraping private profiles;
- sending resume data to third-party AI APIs;
- unlicensed/noncommercial models in commercial production;
- microservices/Kubernetes solely for appearance;
- permanent resume retention in a public showcase;
- fake customers, testimonials, or accuracy metrics.

## 18.5 Stakeholder lens

| Stakeholder | Missing question the product must answer |
|---|---|
| Technical recruiter | Which requirements are truly required, and where is the evidence? |
| Hiring manager | Does the candidate demonstrate comparable responsibility and scope? |
| Candidate | What did the system read, and can I correct it? |
| Engineering manager | Are project/work claims contextual and recent, not just keywords? |
| ATS architect | Can this result be reproduced after a model/ontology change? |
| Security lead | Can a hostile file escape parsing or leak PII? |
| Legal/compliance | Is the selection procedure validated, auditable, noticed, and reviewable? |
| CTO | Can the system scale and evolve without distributed complexity or vendor lock-in? |
| ML lead | Does relevance improve on a representative gold set and every critical slice? |
| Product manager | Does the interface reduce recruiter time while keeping the human accountable? |

---

# 19. Delivery roadmap

## Phase 0 — Research, measurement, and safety baseline (2–4 weeks)

**Outcome:** establish truth before rebuilding.

- freeze and document current parser/scorer behavior;
- create representative gold documents and annotation guide;
- benchmark current MiniLM/BM25/TF-IDF formula;
- add parser/model/config version capture;
- threat-model upload and retention;
- finalize product vocabulary and IT scope;
- design landing page and calibrated job workflow.

**Exit criteria:** baseline metrics, approved target schema, threat model, and test corpus exist.

## MVP — Credible public IT screening showcase (6–10 weeks)

### Product

- public landing page as `/`;
- no login/account controls;
- mobile: Resume Review and one-to-one Match only;
- desktop: all four modes;
- synthetic sample demo;
- white/dark theme consistency;
- real processing states and accessible evidence UI.

### Platform

- PostgreSQL + pgvector;
- Redis and durable workers;
- object quarantine/lifecycle;
- ClamAV and isolated parsers;
- structured PDF/DOCX/TXT parsing with selective OCR;
- normalized evidence schema;
- short-TTL anonymous sessions/deletion.

### Matching

- IT scope classifier with abstention;
- versioned seed ontology;
- recruiter-confirmed JD requirements;
- full-text/BM25 + dense retrieval + RRF;
- small cross-encoder reranker;
- requirement-level evidence cards;
- separate document quality;
- fit bands/confidence, no auto-reject.

### Quality

- unit/integration/golden/E2E/security/load tests;
- gold-set retrieval/ranking baseline;
- telemetry without PII;
- Docker Compose production deployment.

**Exit criteria:** security gates pass, every result is evidence-linked/reproducible, accuracy metrics beat the existing baseline on held-out data, and a visitor can complete both mobile core flows without assistance.

## Version 2 — Recruiter-grade workflow (8–12 weeks)

- richer role-family calibration templates;
- visual Boolean/structured filters;
- saved searches and rediscovery;
- parse correction and rerun;
- candidate criterion comparison;
- batch retry/cancel/resume;
- duplicate resolution;
- ontology curator interface and impact test;
- PII-blind first review;
- OpenSearch only if full-text/facet benchmark justifies it;
- role-specific reranker fine-tuning;
- model/ontology shadow releases;
- richer analytics and export.

**Exit criteria:** recruiter study shows faster evidence review without materially worse accuracy or higher unjustified override.

## Version 3 — Validated intelligence and integrations

- ATS integration adapter framework;
- multilingual support if demand and evaluation data exist;
- learned requirement/entity linker;
- calibrated role-family fit bands;
- active learning from adjudicated pairwise judgments;
- local cited narrative reports;
- structured interview kits;
- bias/slice dashboards and change approval;
- high availability and separate inference/search deployment if triggered by load.

**Exit criteria:** external validation, documented model/data cards, controlled integrations, and reliable SLOs.

## Enterprise edition

- OIDC/SAML SSO, SCIM, RBAC, tenant isolation;
- regional deployment and tenant-specific retention;
- encryption keys and audit export;
- legal hold/deletion workflows;
- tenant ontology/profile extensions;
- HA PostgreSQL, durable broker, replicated object store;
- private networking and egress control;
- full model risk management, bias audit support, notices, appeal/correction;
- disaster recovery objectives and tested restore;
- SLA, support, change management, and signed releases.

## Future AI—only after validation

- IT-domain section and entity models;
- learned role equivalence suggestions with curator approval;
- cross-encoder trained on adjudicated evidence pairs;
- counterfactual evidence explanations;
- ontology change detection from licensed/open technology sources;
- local, citation-bound report wording;
- retrieval uncertainty and out-of-distribution detection.

Never make autonomous rejection, emotion/personality inference, protected-trait inference, or ungrounded generative scoring a roadmap item.

---

# Final recommended stack

| Concern | Choice |
|---|---|
| Web | Existing React/TanStack/TypeScript/Tailwind/Radix |
| API | FastAPI, Pydantic, SQLAlchemy 2, Alembic |
| Database | PostgreSQL + pgvector + PostgreSQL full text |
| Cache/progress | Redis-compatible open-source server |
| Durable work | Celery; RabbitMQ if queue semantics outgrow Redis |
| Objects | MinIO-compatible S3 storage |
| Parsing | PyMuPDF + enhanced python-docx + targeted pdfplumber + selective Tesseract/RapidOCR |
| NLP | spaCy + ontology rules + RapidFuzz |
| Embedding | BGE-small-en-v1.5 or E5-base-v2 selected by gold benchmark |
| Reranking | Small MS MARCO MiniLM cross-encoder initially |
| Inference | Sentence Transformers/Transformers + ONNX Runtime/OpenVINO where validated |
| Search at scale | OpenSearch after measured need; Qdrant as vector-centric alternative |
| Security | Nginx/Traefik limits, ClamAV, isolated no-network parser, Trivy, SBOM |
| Observability | OpenTelemetry, Prometheus, Grafana, Loki, Tempo |
| Delivery | Docker Compose first, GitHub Actions, Linux; Kubernetes only on trigger |
| Generative AI | None for MVP |

# Prioritized decision register

| Priority | Decision | Status |
|---:|---|---|
| P0 | Separate resume quality from job fit | Required |
| P0 | Stop presenting uncalibrated score as qualification probability | Required |
| P0 | Preserve evidence spans and all release versions | Required |
| P0 | Add secure quarantine/sandbox/retention pipeline | Required |
| P0 | Make landing page the default and remove authentication UI | Required |
| P0 | Human-confirm JD requirements and keep human decision | Required |
| P1 | Replace raw weighted fusion with hybrid retrieval + RRF + reranking | Recommended |
| P1 | Replace flat skills list with versioned IT ontology | Recommended |
| P1 | Migrate production data to PostgreSQL/pgvector | Recommended |
| P1 | Add evaluation corpus and regression gates | Recommended |
| P2 | Add OpenSearch, multilingual BGE-M3, or local narrative model | Only after evidence of need |
| P3 | Microservices/Kubernetes | Only after scale/team trigger |

# Recommendation implementation matrix

This matrix makes the rationale, industry precedent, open-source path, performance impact, complexity, and release timing explicit for the principal recommendations.

| Recommendation | Why needed | Industry practice | Open-source options | Performance impact | Complexity | Phase |
|---|---|---|---|---|---|---|
| Secure staged ingestion | Uploaded documents are hostile and contain PII | Quarantine, format limits, scanning, isolated processing | Nginx, libmagic, ClamAV, containers/seccomp | Adds scan latency; prevents catastrophic abuse | Medium | MVP essential |
| Source-preserving parser | Explanations and corrections require provenance | Structured profiles plus editable source record | PyMuPDF, python-docx, pdfplumber, Tesseract/RapidOCR | Moderate storage; selective OCR expensive | Medium/high | MVP essential |
| IT scope classifier with abstention | Product must reject scope, not unconventional IT careers | Taxonomy/role-family routing and manual review | spaCy, scikit-learn, small encoder | Very low per document | Medium | MVP essential |
| Versioned IT ontology | Aliases/equivalents cannot be handled by flat keywords | Skills foundations and normalized concepts | O*NET, ESCO local data, NICE, PostgreSQL | Faster exact matching; small graph lookup | Medium/high | MVP seed; V2 curation |
| JD calibration | Inferred requirements must not become hidden gates | Required/preferred criteria and recruiter calibration | FastAPI/PostgreSQL domain model, React UI | Small interactive step; reduces false exclusions | Medium | MVP essential |
| Corpus lexical retrieval | Technical identifiers and exact phrases matter | Full-text/Boolean candidate search | PostgreSQL FTS/BM25 extension, OpenSearch | Fast with index; ingest/index cost | Medium | MVP essential |
| Section-aware dense retrieval | Semantic equivalents/responsibilities need context | Semantic candidate/job matching | Sentence Transformers, BGE/E5, pgvector/Qdrant | Embedding ingest cost; low query cost | Medium | MVP important |
| Rank fusion | Raw BM25/cosine scales are incompatible | Hybrid search with fusion | RRF in application, OpenSearch, Qdrant | Negligible over shortlist | Low/medium | MVP essential |
| Cross-encoder reranking | Bi-encoder retrieval sacrifices precision | Retrieve high recall, rerank limited top-N | Sentence Transformers cross-encoders, BGE rerankers | Main online ML cost; bounded by top-N | Medium | MVP important |
| Evidence scorecard and bands | A raw percent is not a qualification probability | Factor explanations, relative labels, human review | Deterministic templates, calibrated sklearn models | Negligible after evidence scoring | Medium/high | MVP essential |
| PostgreSQL/pgvector | SQLite/JSON cannot support audit and concurrent workloads | Relational candidate/application records and search indexes | PostgreSQL, pgvector | Better concurrency/querying; operational memory | Medium | MVP production |
| Durable workers | OCR and inference exceed request lifetimes | Asynchronous processing with status/retry | Celery/Dramatiq, Redis/RabbitMQ | Throughput and resilience improvement | Medium | MVP production |
| OpenSearch at trigger | Advanced Boolean/facets may outgrow DB search | Dedicated search index at enterprise scale | OpenSearch | Faster complex search; duplicated index/write cost | High operations | V2/scale trigger |
| Gold-set evaluation | Public benchmarks do not validate hiring relevance | Validated selection procedures and judgment lists | pytest, ranx/trec_eval, scikit-learn, Locust/k6 | Offline CI cost | High organizational | Phase 0/MVP gate |
| Human decision/audit | Ranking errors have consequential impact | Recruiter review, scorecards, dispositions, audit | PostgreSQL events, evidence reports | Small storage/workflow cost | Medium | MVP essential |
| Local cited narrative model | Can improve report readability only after facts are selected | Explainable summaries grounded in records | Small Qwen/Mistral-family model where license fits, vLLM/Ollama | High memory/latency; optional | High | V3 only |

# Definition of “production-ready”

NeuralRecruit is production-ready only when all of the following are true:

- every parsed fact and ranking reason is traceable to source evidence;
- parser, ontology, model, calibration, and profile versions reproduce a result;
- the gold set demonstrates acceptable parsing, retrieval, ranking, calibration, and slice performance;
- uploaded files are quarantined, scanned, sandboxed, limited, and deleted according to policy;
- the UI expresses uncertainty and never converts missing resume evidence into a claim about the person;
- recruiters confirm job requirements and make the final decision;
- the service survives worker failure, retries idempotently, and restores from backups;
- accessibility, security, privacy, and performance gates are enforced in CI/release;
- all software and model licenses are compatible with the deployment;
- legal/compliance review has been completed for the jurisdictions and actual use.

Until those conditions are met, the correct description is **an advanced, evidence-oriented IT resume screening showcase**, not an enterprise hiring decision system.

---

## Research sources

Primary product and technical sources used throughout this blueprint:

- [Lever: understanding resume parsing](https://help.lever.co/hc/en-us/articles/20087345054749-Understanding-resume-parsing)
- [Greenhouse: candidate filters](https://support.greenhouse.io/hc/en-us/articles/360043184152-Candidate-and-prospect-filters)
- [Greenhouse: Talent Filtering](https://support.greenhouse.io/hc/en-us/articles/27104809835291-Talent-Filtering)
- [Greenhouse: resume keyword search](https://support.greenhouse.io/hc/en-us/articles/115004600186-Search-resumes-for-keywords)
- [LinkedIn Recruiter: filters](https://www.linkedin.com/help/recruiter/answer/a411285)
- [LinkedIn Recruiter: skills filter](https://www.linkedin.com/help/recruiter/answer/a593591)
- [LinkedIn Recruiter: Boolean search](https://www.linkedin.com/help/recruiter/answer/a524335)
- [PyMuPDF documentation](https://pymupdf.readthedocs.io/en/latest/app1.html)
- [pdfplumber documentation](https://github.com/jsvine/pdfplumber/blob/stable/README.md)
- [Apache Tika](https://tika.apache.org/)
- [O*NET database](https://www.onetcenter.org/database.html)
- [ESCO](https://esco.ec.europa.eu/en/use-esco)
- [NIST NICE Framework](https://www.nist.gov/publications/workforce-framework-cybersecurity-nice-framework)
- [Sentence Transformers retrieve/rerank](https://www.sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html)
- [BGE-M3 model card](https://huggingface.co/BAAI/bge-m3)
- [Qdrant hybrid query guidance](https://qdrant.tech/documentation/search/hybrid-queries/)
- [pgvector](https://github.com/pgvector/pgvector)
- [OpenSearch hybrid optimization](https://docs.opensearch.org/latest/search-plugins/search-relevance/optimize-hybrid-search/)
- [FastAPI deployment](https://fastapi.tiangolo.com/deployment/)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [EEOC selection procedures](https://www.eeoc.gov/laws/guidance/employment-tests-and-selection-procedures)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [NYC Automated Employment Decision Tools](https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page)
- [EU AI Act](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32024R1689)
