"""
nlp_utils.py
------------
Best-in-class NLP pipeline combining:

1. spaCy PhraseMatcher against a curated O*NET-inspired skills taxonomy
   — eliminates false positives from pure regex extraction
2. Regex patterns for tech tokens (Node.js, C++, CI/CD) not in taxonomy
3. Synonym normalisation map (50+ pairs)
4. Three-tier resume matching: substring → synonym → fuzzy
5. BM25-safe text cleaning via spaCy lemmatization

Research basis: Hybrid TF-IDF + Sentence-BERT approach (r=0.891, 99.97%
time reduction — ICTAI 2024 government hiring study), combined with
taxonomy-based skill matching used in EMSI/O*NET ATS systems.
"""

import re
from collections import Counter
from difflib import SequenceMatcher
from typing import List, Set, Tuple

import spacy

from app.core.skills_taxonomy import UNIQUE_SKILLS, SKILL_LOOKUP, SOFT_SKILLS

# ---------------------------------------------------------------------------
# Load spaCy + build PhraseMatcher
# ---------------------------------------------------------------------------
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    spacy.cli.download("en_core_web_sm")
    nlp = spacy.load("en_core_web_sm")

from spacy.matcher import PhraseMatcher
_phrase_matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
_patterns = [nlp.make_doc(s) for s in UNIQUE_SKILLS]
_phrase_matcher.add("SKILLS", _patterns)

# ---------------------------------------------------------------------------
# Stopwords
# ---------------------------------------------------------------------------
STOPWORDS = set("""
a about above after again against all am an and any are aren't as at be
because been before being below between both but by can't cannot could
couldn't did didn't do does doesn't doing don't down during each few for
from further had hadn't has hasn't have haven't having he he'd he'll he's
her here here's hers herself him himself his how how's i i'd i'll i'm i've
if in into is isn't it it's its itself let's me more most mustn't my myself
no nor not of off on once only or other ought our ours ourselves out over
own same shan't she she'd she'll she's should shouldn't so some such than
that that's the their theirs them themselves then there there's these they
they'd they'll they're they've this those through to too under until up
very was wasn't we we'd we'll we're we've were weren't what what's when
when's where where's which while who who's whom why why's with won't would
wouldn't you you'd you'll you're you've your yours yourself yourselves
""".split())

# ---------------------------------------------------------------------------
# Generic noise — single words that are not skills
# ---------------------------------------------------------------------------
GENERIC_NOISE = set("""
experience experiences year years strong solid excellent good great ability
abilities knowledge understanding skill skills team teams role roles
responsibility responsibilities candidate candidates company companies
work working environment opportunity opportunities position positions job
jobs requirement requirements qualification qualifications plus preferred
required must should ideal ideally including include includes related
similar etc within across using use used build building built develop
developing development developed help helping ensure ensuring provide
providing support supporting communication communicate written verbal
collaborate collaborative collaboration manage managing management
organization organizational detail attention background degree bachelor
bachelors masters field minimum maximum level junior senior mid entry
full time part time remote hybrid onsite location based salary benefits
perks apply application resume cover letter join growing fast paced
dynamic culture mission vision passion passionate looking seeking
responsible perform performing tasks task duties duty new about overview
description summary internship internships projects solutions applications
datasets problems findings stakeholders accuracy reliability
deployment production testing training tuning cleaning preprocessing
experimentation optimization performance metrics pipeline pipelines
algorithms techniques tools platform platforms hands hands-on
cross functional cross-functional key responsibilities key responsibility
overview nice have nice-to-have day day-to-day proficiency proficient
familiarity familiar exposure bonus points contribute contributes
contributing contribution contributions implement implements implementing
implemented deploy deploys deploying deployed integrate integrates
integrating integrated analyse analyze analysing analyzing maintain
maintains maintaining improve improves improving write writes writing
written deliver delivers delivering create creates creating monitor
monitors monitoring evaluate evaluates evaluating present presents
reporting report reports update updates updating define defines defining
coordinate coordinates coordinating drive drives driving lead leads
leading take takes own owns owning grow grows growing scale scales
scaling analytical fast growing mission driven data information
model models system systems service services solution solutions
product products feature features process processes method methods
approach area areas challenge challenges goal goals impact value values
output outputs input inputs end user users customer customers client
clients partner partners design designs designing designed
""".split())

# ---------------------------------------------------------------------------
# Synonym groups (abbreviation ↔ full-form normalisation)
# ---------------------------------------------------------------------------
SYNONYM_GROUPS = [
    {"js", "javascript"}, {"ts", "typescript"}, {"py", "python"},
    {"ml", "machine learning"}, {"dl", "deep learning"},
    {"ai", "artificial intelligence"}, {"nlp", "natural language processing"},
    {"cv", "computer vision"}, {"db", "database", "databases"},
    {"oop", "object oriented programming", "object-oriented programming"},
    {"api", "apis", "application programming interface"},
    {"ui", "user interface"}, {"ux", "user experience"},
    {"ci/cd", "ci cd", "continuous integration", "continuous deployment"},
    {"k8s", "kubernetes"}, {"aws", "amazon web services"},
    {"gcp", "google cloud platform", "google cloud"},
    {"azure", "microsoft azure"}, {"sql", "structured query language"},
    {"nosql", "non-relational database"}, {"rest", "restful", "rest api"},
    {"react", "reactjs", "react.js"}, {"node", "nodejs", "node.js"},
    {"vue", "vuejs", "vue.js"}, {"tf", "tensorflow"}, {"torch", "pytorch"},
    {"llm", "large language model", "large language models"},
    {"rag", "retrieval augmented generation"},
    {"genai", "generative ai", "gen ai"},
    {"devops", "dev ops"}, {"oss", "open source"},
    {"nlp", "natural language processing"},
    {"svm", "support vector machine"},
    {"cnn", "convolutional neural network"},
    {"rnn", "recurrent neural network"},
    {"bi", "business intelligence"},
    {"eda", "exploratory data analysis"},
    {"etl", "extract transform load"},
    {"tdd", "test driven development"},
    {"ai/ml", "ai ml", "machine learning", "artificial intelligence"},
]

_SYNONYM_LOOKUP: dict = {}
for _gid, _group in enumerate(SYNONYM_GROUPS):
    for _term in _group:
        _SYNONYM_LOOKUP[_term.lower()] = _gid


def normalise(term: str) -> str:
    t = re.sub(r"\s+", " ", term.strip().lower())
    gid = _SYNONYM_LOOKUP.get(t)
    if gid is not None:
        return sorted(SYNONYM_GROUPS[gid])[0]
    return t


# ---------------------------------------------------------------------------
# Tech-token regex (catches things not in taxonomy like version-specific tools)
# ---------------------------------------------------------------------------
TECH_TOKEN_RE = re.compile(
    r"\b(?=[A-Za-z])[A-Za-z][A-Za-z0-9]*(?:[.+#/-][A-Za-z0-9]+)+\b|"
    r"\b[A-Z]{2,6}\b"
)

SECTION_HEADER_RE = re.compile(
    r"(skills?|requirements?|qualifications?|must[\s-]?have|"
    r"tech(nical)?\s*stack|tools?|technologies)",
    re.IGNORECASE,
)

FUZZY_THRESHOLD = 0.86


def _strip_edge_punct(token: str) -> str:
    return token.strip(".,;:!?()[]{}'\"-/")


def fuzzy_ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


# ---------------------------------------------------------------------------
# Text cleaning
# ---------------------------------------------------------------------------
def clean_markdown(text: str) -> str:
    text = re.sub(r"#{1,6}\s*", "", text)
    text = re.sub(r"\*{1,2}([^*]+)\*{1,2}", r"\1", text)
    text = re.sub(r"^\s*[\*\-\.]+\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\(|\)", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def clean_text_for_embedding(text: str) -> str:
    """spaCy lemmatization + stopword removal — used for embedding & BM25."""
    text = clean_markdown(text)
    doc = nlp(text)
    tokens = [
        token.lemma_.lower() for token in doc
        if not token.is_punct and not token.is_space and not token.is_stop
        and len(token.text) > 1
    ]
    return " ".join(tokens)


# ---------------------------------------------------------------------------
# PRIMARY: spaCy PhraseMatcher — taxonomy-based skill extraction
# ---------------------------------------------------------------------------
def extract_skills_from_text(text: str) -> List[str]:
    """
    Extract skills using spaCy PhraseMatcher against the curated taxonomy.
    This is the ATS-grade method — only real skills pass through.
    Returns list of canonical display names (deduplicated).
    """
    doc = nlp(clean_markdown(text))
    matches = _phrase_matcher(doc)
    found: dict[str, str] = {}  # lower_key -> display
    for _, start, end in matches:
        span_text = doc[start:end].text
        key = normalise(span_text)
        if key not in found:
            # Prefer the taxonomy canonical name
            canonical = SKILL_LOOKUP.get(span_text.lower(), span_text)
            found[key] = canonical
    return list(found.values())


# ---------------------------------------------------------------------------
# SECONDARY: Regex tech-token extraction for tools not in taxonomy
# ---------------------------------------------------------------------------
def extract_tech_tokens(text: str) -> List[str]:
    """Catch versioned/compound tech tokens: Node.js, C++, CI/CD, GPT-4."""
    found = []
    for m in TECH_TOKEN_RE.findall(text):
        m = _strip_edge_punct(m)
        if len(m) < 2 or m.lower() in GENERIC_NOISE or m.lower() in STOPWORDS:
            continue
        # Must not be an ALL-CAPS stopword
        if m.isupper() and m.lower() in STOPWORDS:
            continue
        # Must not be a single word already in taxonomy (already covered)
        if " " not in m and SKILL_LOOKUP.get(m.lower()):
            continue
        found.append(m)
    return list(dict.fromkeys(found))  # deduplicate, preserve order


# ---------------------------------------------------------------------------
# COMBINED JD keyword extractor
# ---------------------------------------------------------------------------
def extract_jd_keywords(jd_text: str, max_skills: int = 30) -> List[dict]:
    """
    1. PhraseMatcher (taxonomy) — high precision
    2. Tech-token regex — catches versioned tools
    3. Score by frequency + section-bonus
    Returns ranked list of {key, display, score} dicts.
    """
    scores: Counter = Counter()
    canonical_display: dict = {}
    lines = jd_text.splitlines()

    # --- Pass 1: PhraseMatcher on full text ---
    taxonomy_skills = extract_skills_from_text(jd_text)
    for skill in taxonomy_skills:
        key = normalise(skill)
        scores[key] += 5  # base weight for taxonomy hit
        canonical_display.setdefault(key, skill)

    # --- Pass 2: Frequency bonus — skills mentioned more = more important ---
    text_lower = jd_text.lower()
    for key, display in canonical_display.items():
        # Count occurrences
        count = text_lower.count(key)
        if count > 1:
            scores[key] += count

    # --- Pass 3: Section-aware bonus ---
    for line in lines:
        if SECTION_HEADER_RE.search(line):
            line_lower = line.lower()
            for key in list(scores.keys()):
                if key in line_lower:
                    scores[key] += 3

    # --- Pass 4: Tech-token regex for compound tokens not in taxonomy ---
    for line in lines:
        in_section = bool(SECTION_HEADER_RE.search(line))
        for tok in extract_tech_tokens(line):
            key = normalise(tok)
            if key not in canonical_display:  # don't double-count taxonomy hits
                scores[key] += (4 if in_section else 2)
                canonical_display.setdefault(key, tok)

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    return [
        {"key": key, "display": canonical_display.get(key, key), "score": score}
        for key, score in ranked[:max_skills]
        if key not in GENERIC_NOISE and len(key) > 1
    ]


# ---------------------------------------------------------------------------
# Resume skill matching — PhraseMatcher + fuzzy fallback
# ---------------------------------------------------------------------------
def build_resume_skill_set(resume_text: str) -> Tuple[Set[str], Set[str]]:
    """
    Returns (taxonomy_keys, ngram_set) for the resume.
    ngram_set includes 1-3 word ngrams so multi-word skills like
    'Data Analysis', 'Neural Networks' are found reliably.
    """
    taxonomy_skills = extract_skills_from_text(resume_text)
    taxonomy_keys = {normalise(s) for s in taxonomy_skills}

    words = re.findall(r"[A-Za-z][A-Za-z0-9+#.\-/]*", resume_text.lower())
    ngram_set: Set[str] = set()
    for i, w in enumerate(words):
        w = w.strip(".,;:")
        if len(w) > 1:
            ngram_set.add(normalise(w))
        if i + 1 < len(words):
            bigram = w + " " + words[i + 1].strip(".,;:")
            ngram_set.add(normalise(bigram))
        if i + 2 < len(words):
            trigram = (w + " " + words[i + 1].strip(".,;:")
                       + " " + words[i + 2].strip(".,;:"))
            ngram_set.add(normalise(trigram))

    return taxonomy_keys, ngram_set


def skill_in_resume(
    skill_key: str,
    resume_lower: str,
    taxonomy_keys: Set[str],
    ngram_set: Set[str],
) -> bool:
    """
    Four-tier matching:
    1. Taxonomy PhraseMatcher key (highest precision)
    2. Normalised 1-3 word ngram set (handles Data Analysis, Neural Networks)
    3. Direct substring in resume text (catches acronyms inline)
    4. Synonym variants + fuzzy (JS=JavaScript, AWS=Amazon Web Services)
    """
    if skill_key in taxonomy_keys:
        return True
    if skill_key in ngram_set:
        return True
    if skill_key in resume_lower:
        return True
    gid = _SYNONYM_LOOKUP.get(skill_key)
    if gid is not None:
        for variant in SYNONYM_GROUPS[gid]:
            if variant in resume_lower or variant in ngram_set:
                return True
    for tok in ngram_set:
        if abs(len(tok) - len(skill_key)) <= 2 and fuzzy_ratio(skill_key, tok) >= FUZZY_THRESHOLD:
            return True
    return False
