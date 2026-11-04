import { useState } from "react";
import { type Account, call, day, projectName } from "./api";
import { follow } from "./nav";
import { Field, Notice, Problem, Sheet, Shell, To } from "./Page";

// Your projects (M9e): each repo you've linked, by the name you gave it (B-zqkwk), opening its desk at
// /projects/{project}, the relay's own address for it (B-7z97x). Renamed here; the ID only in a tooltip (D69's spirit).

export function Projects({ account, reload, notice }: { account: Account; reload: () => Promise<void>; notice?: string | undefined }) {
  const [renaming, setRenaming] = useState<string>();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [done, setDone] = useState<string | undefined>(notice);

  const save = async (id: string) => {
    setBusy(true);
    setProblem(undefined);
    try {
      const r = await call<{ name: string }>("PATCH", `/v1/account/projects/${encodeURIComponent(id)}`, { name });
      await reload();
      setRenaming(undefined);
      setDone(`Renamed: it's “${r.name}” now.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell who={account.handle}>
      <Sheet title="Your projects" lead={account.projects.length ? "Each is a repo whose agents send you their decisions. Open one to answer its cards." : undefined}>
        <Notice text={done} />
        <Problem text={problem} />
        {account.projects.length === 0 ? (
          <div className="site-empty">
            <p>No projects yet.</p>
            <p className="small">
              A project is made when you approve its first machine. In a repo where Baesian is set up, run <code>baesian login --service {location.origin}</code>, then open the address it prints.
            </p>
          </div>
        ) : (
          <ul className="site-rows">
            {account.projects.map((p) =>
              renaming === p.id ? (
                <li key={p.id} className="site-row editing">
                  <Field label={`A new name for ${projectName(p)}`} value={name} onChange={setName} maxLength={60} autoFocus autoComplete="off" />
                  <div className="site-actions">
                    <button type="button" className="confirm" disabled={busy || !name.trim()} onClick={() => void save(p.id)}>
                      Save the name
                    </button>
                    <button type="button" className="cancel" disabled={busy} onClick={() => setRenaming(undefined)}>
                      Cancel
                    </button>
                  </div>
                </li>
              ) : (
                <li key={p.id} className="site-row project">
                  <a className="open" href={`/projects/${encodeURIComponent(p.id)}`} onClick={follow(`/projects/${encodeURIComponent(p.id)}`)} title={p.id}>
                    <span className="nm">{projectName(p)}</span>
                    <span className="st">Linked {day(p.created)}</span>
                  </a>
                  <button
                    type="button"
                    className="switch end"
                    aria-label={`Rename ${projectName(p)}`}
                    onClick={() => {
                      setRenaming(p.id);
                      setName(p.name ?? "");
                      setDone(undefined);
                    }}
                  >
                    Rename
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
        <p className="small after">
          Approving a machine? <To to="/device">Enter its code</To>.
        </p>
      </Sheet>
    </Shell>
  );
}
