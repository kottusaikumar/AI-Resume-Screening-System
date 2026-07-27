import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, Loader2, Search } from "lucide-react";
import { fetchSkillsDb, ApiError, type SkillsDb } from "@/lib/api";
import { useExport } from "@/lib/scanner-context";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_layout/skills-db")({
  head: () => ({ meta: [{ title: "Skills Database — NeuralRecruit" }] }),
  component: SkillsDbPage,
});

function SkillsDbPage() {
  const { setExportConfig } = useExport();
  const [db, setDb] = useState<SkillsDb | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetchSkillsDb()
      .then(setDb)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Couldn't load the skills database."),
      );
  }, []);

  useEffect(() => {
    if (!db) {
      setExportConfig(null);
      return;
    }
    setExportConfig(() => {
      downloadCsv("skills-database.csv", [
        ["Category", "Skill"],
        ...db.categories.flatMap((c) => c.skills.map((s) => [c.name, s])),
      ]);
    }, "skills database");
    return () => setExportConfig(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  const filtered = useMemo(() => {
    if (!db) return null;
    const q = query.trim().toLowerCase();
    if (!q) return db.categories;
    return db.categories
      .map((c) => ({ ...c, skills: c.skills.filter((s) => s.toLowerCase().includes(q)) }))
      .filter((c) => c.skills.length > 0);
  }, [db, query]);

  const matchCount = filtered?.reduce((sum, c) => sum + c.skills.length, 0) ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <div className="font-mono-label text-primary-glow">// skills_taxonomy</div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Skills <span className="text-gradient-primary">Database</span>
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          The taxonomy NeuralRecruit's matching engine uses to identify skills in resumes and job
          descriptions — {db ? db.total_skills : "—"} terms across {db ? db.categories.length : "—"}{" "}
          categories.
        </p>
      </header>

      {error && (
        <div className="glass rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-center gap-3">
          <AlertTriangle className="size-4 text-destructive shrink-0" />
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      )}

      {!db && !error ? (
        <div className="glass rounded-xl p-10 flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading skills database…
        </div>
      ) : db ? (
        <>
          <div className="glass rounded-xl p-4 flex items-center gap-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search skills, e.g. “Kubernetes”, “NLP”, “Terraform”…"
              className="flex-1 bg-transparent border-none focus:outline-none text-sm placeholder:text-muted-foreground/70"
            />
            {query && (
              <span className="font-mono-label text-muted-foreground">{matchCount} MATCHES</span>
            )}
          </div>

          {filtered && filtered.length === 0 ? (
            <div className="glass rounded-xl p-10 text-center text-sm text-muted-foreground">
              No skills found matching “{query}”.
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {filtered?.map((cat) => (
                <section key={cat.name} className="glass rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 rounded-md bg-primary/15 border border-primary/30 grid place-items-center">
                        <Database className="size-3.5 text-primary-glow" />
                      </div>
                      <h3 className="font-display font-semibold text-sm">{cat.name}</h3>
                    </div>
                    <span className="font-mono-label text-muted-foreground">
                      {cat.skills.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cat.skills.map((s) => (
                      <span
                        key={s}
                        className="px-2.5 py-1 rounded-full text-xs border border-border bg-surface-2/40 text-foreground/90 font-mono"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
