"""
skills_taxonomy.py
------------------
Curated skills taxonomy inspired by O*NET, EMSI Burning Glass, and
LinkedIn Skills taxonomy — covering Tech, Data/AI, Cloud, DevOps,
Soft Skills, Domain knowledge, and Certifications.

Used by spaCy PhraseMatcher to precisely identify skills in both
resumes and job descriptions, eliminating false positives from
pure regex/ngram extraction.

No LLM or external API needed — pure offline matching.
"""

# ---------------------------------------------------------------------------
# TECH & PROGRAMMING
# ---------------------------------------------------------------------------
PROGRAMMING_LANGUAGES = [
    "Python", "Java", "JavaScript", "TypeScript", "C", "C++", "C#",
    "Go", "Golang", "Rust", "Swift", "Kotlin", "Ruby", "PHP", "Scala",
    "R", "MATLAB", "Julia", "Perl", "Bash", "Shell", "PowerShell",
    "Dart", "Elixir", "Haskell", "Lua", "Groovy", "COBOL", "Fortran",
]

WEB_FRONTEND = [
    "React", "ReactJS", "React.js", "Angular", "AngularJS", "Vue",
    "VueJS", "Vue.js", "Next.js", "Nuxt.js", "Svelte", "HTML", "CSS",
    "SASS", "SCSS", "Tailwind CSS", "Bootstrap", "Material UI",
    "Redux", "Webpack", "Vite", "jQuery", "D3.js", "Three.js",
]

WEB_BACKEND = [
    "Node.js", "NodeJS", "Express", "Express.js", "FastAPI", "Django",
    "Flask", "Spring Boot", "Spring", "Laravel", "Ruby on Rails",
    "ASP.NET", ".NET", "NestJS", "GraphQL", "REST API", "RESTful",
    "gRPC", "WebSockets", "Microservices", "Serverless",
]

DATABASES = [
    "SQL", "MySQL", "PostgreSQL", "SQLite", "MongoDB", "Redis",
    "Cassandra", "DynamoDB", "Elasticsearch", "Neo4j", "Oracle",
    "Microsoft SQL Server", "MSSQL", "MariaDB", "CouchDB", "Firebase",
    "Supabase", "PlanetScale", "Vector Database", "Pinecone", "Weaviate",
    "ChromaDB", "Qdrant", "FAISS",
]

# ---------------------------------------------------------------------------
# AI / ML / DATA SCIENCE
# ---------------------------------------------------------------------------
ML_FRAMEWORKS = [
    "TensorFlow", "PyTorch", "Keras", "Scikit-learn", "XGBoost",
    "LightGBM", "CatBoost", "Hugging Face", "Transformers",
    "JAX", "MXNet", "Caffe", "ONNX", "OpenCV",
]

ML_TECHNIQUES = [
    "Machine Learning", "Deep Learning", "Supervised Learning",
    "Unsupervised Learning", "Reinforcement Learning",
    "Transfer Learning", "Fine-tuning", "Feature Engineering",
    "Hyperparameter Tuning", "Cross-validation", "A/B Testing",
    "Regression", "Classification", "Clustering", "Dimensionality Reduction",
    "Neural Networks", "CNN", "RNN", "LSTM", "GRU", "Transformer",
    "BERT", "GPT", "Attention Mechanism", "Backpropagation",
    "Gradient Descent", "Ensemble Methods", "Random Forest",
    "Support Vector Machine", "SVM", "Decision Tree",
    "Naive Bayes", "K-Means", "PCA", "t-SNE", "UMAP",
]

NLP_SKILLS = [
    "Natural Language Processing", "NLP", "Text Classification",
    "Named Entity Recognition", "NER", "Sentiment Analysis",
    "Topic Modeling", "Text Summarization", "Machine Translation",
    "Speech Recognition", "Text Generation", "Word Embeddings",
    "Word2Vec", "GloVe", "FastText", "BERT", "Sentence Transformers",
    "spaCy", "NLTK", "Gensim", "Tokenization", "Lemmatization",
]

GENERATIVE_AI = [
    "Generative AI", "Large Language Models", "LLM", "ChatGPT",
    "GPT-4", "Claude", "Llama", "Mistral", "Stable Diffusion",
    "Diffusion Models", "GAN", "VAE", "Prompt Engineering",
    "RAG", "Retrieval Augmented Generation", "LangChain", "LlamaIndex",
    "Embeddings", "Vector Search", "Semantic Search",
]

COMPUTER_VISION = [
    "Computer Vision", "Image Classification", "Object Detection",
    "Image Segmentation", "Face Recognition", "OCR", "OpenCV",
    "YOLO", "ResNet", "VGG", "EfficientNet", "Image Processing",
    "Video Processing", "3D Vision", "Depth Estimation",
]

DATA_SKILLS = [
    "Data Science", "Data Analysis", "Data Engineering",
    "Data Visualization", "EDA", "Exploratory Data Analysis",
    "Statistical Analysis", "Data Cleaning", "Data Wrangling",
    "Data Mining", "Feature Selection", "ETL", "Data Pipeline",
    "Data Modeling", "Business Intelligence", "BI",
    "Pandas", "NumPy", "SciPy", "Matplotlib", "Seaborn",
    "Plotly", "Tableau", "Power BI", "Looker", "Qlik",
    "Apache Spark", "PySpark", "Hadoop", "Hive", "Kafka",
    "Airflow", "dbt", "Databricks", "Snowflake", "BigQuery",
]

MLOps = [
    "MLOps", "ML Pipeline", "Model Deployment", "Model Serving",
    "Model Monitoring", "Feature Store", "MLflow", "DVC",
    "Kubeflow", "Seldon", "BentoML", "Ray", "Weights & Biases",
    "Experiment Tracking", "Model Registry",
]

# ---------------------------------------------------------------------------
# CLOUD & DEVOPS
# ---------------------------------------------------------------------------
CLOUD = [
    "AWS", "Amazon Web Services", "Azure", "Microsoft Azure",
    "GCP", "Google Cloud", "Google Cloud Platform",
    "EC2", "S3", "Lambda", "SageMaker", "Bedrock",
    "Azure ML", "Vertex AI", "Google Colab", "Cloud Run",
    "Heroku", "Vercel", "Netlify", "DigitalOcean", "Cloudflare",
]

DEVOPS = [
    "Docker", "Kubernetes", "CI/CD", "Jenkins", "GitHub Actions",
    "GitLab CI", "CircleCI", "Terraform", "Ansible", "Helm",
    "Prometheus", "Grafana", "ELK Stack", "Nginx", "Linux",
    "Git", "GitHub", "GitLab", "Bitbucket", "Agile", "Scrum",
    "Jira", "Confluence",
]

# ---------------------------------------------------------------------------
# DOMAIN KNOWLEDGE
# ---------------------------------------------------------------------------
DOMAIN_SKILLS = [
    "Computer Science", "Software Engineering", "Systems Design",
    "System Architecture", "Distributed Systems", "API Design",
    "Database Design", "Object Oriented Programming", "OOP",
    "Functional Programming", "Design Patterns", "SOLID Principles",
    "Test Driven Development", "TDD", "Unit Testing", "Integration Testing",
    "Software Testing", "QA", "Code Review", "Technical Documentation",
    "Algorithms", "Data Structures", "Competitive Programming",
]

# ---------------------------------------------------------------------------
# SOFT SKILLS (detected but not counted as technical skills by default)
# ---------------------------------------------------------------------------
SOFT_SKILLS = [
    "Communication", "Teamwork", "Leadership", "Problem Solving",
    "Critical Thinking", "Time Management", "Adaptability",
    "Collaboration", "Creativity", "Analytical Skills",
    "Project Management", "Stakeholder Management", "Mentoring",
    "Presentation Skills", "Research Skills",
]

# ---------------------------------------------------------------------------
# COMBINED FLAT TAXONOMY  (all skills, lowercased for matching)
# ---------------------------------------------------------------------------
ALL_TECH_SKILLS = (
    PROGRAMMING_LANGUAGES + WEB_FRONTEND + WEB_BACKEND + DATABASES +
    ML_FRAMEWORKS + ML_TECHNIQUES + NLP_SKILLS + GENERATIVE_AI +
    COMPUTER_VISION + DATA_SKILLS + MLOps + CLOUD + DEVOPS + DOMAIN_SKILLS
)

# Build normalised lookup: lower → canonical display
SKILL_LOOKUP: dict[str, str] = {}
for _s in ALL_TECH_SKILLS + SOFT_SKILLS:
    SKILL_LOOKUP[_s.lower()] = _s

# Deduplicated list (preserving first occurrence)
_seen: set = set()
UNIQUE_SKILLS: list[str] = []
for _s in ALL_TECH_SKILLS:
    _key = _s.lower()
    if _key not in _seen:
        _seen.add(_key)
        UNIQUE_SKILLS.append(_s)
