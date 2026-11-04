import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../../src/storage.js";
import { Store } from "../../src/store.js";
import type { RelayEntry } from "../../src/schema.js";
import { answer, fileCard, machineStore, pinFrom, pullLog, pulled, push, state, upload } from "./client.js";

// B-3zjjx: the answers from before linking go up once, at first link, kept apart. A machine may upload the answers,
// rules, topic merges and preference files a person wrote before the repo was linked, only until the project's first
// answer on the website; the relay keeps them unsigned and marked, and shows their cards as decided. Another machine
// counts them only where its own record at the linking commit holds them (B-45xz8): see test/before-linking.test.ts.

const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> & { error?: string; entry?: RelayEntry; before_linking?: string } });
const REVIEWER = { reviewer: "gus", client: "web" };

/** The files a machine's store wrote under a folder, by path, with their bytes. */
const written = (store: Store, dir: string) => (store.storage as MemoryStorage).paths().filter((p) => p.startsWith(`${dir}/`) && !p.endsWith(".sig"));

describe("the answers from before linking (B-3zjjx)", () => {
  it("are checked as uploads are: their schema, their name, their card, and no account or project", async () => {
    const local = machineStore();
    const id = fileCard(local);
    await push(local);
    const v = local.addVerdict({ card: id, revision: 1, response: "accept", ...REVIEWER });
    const [path] = written(local, "verdicts");
    const bytes = Buffer.from(local.storage.read(path!)!);
    // A verdict that names an account looks like it was given on the website: refused.
    const claimed = Buffer.from(`${JSON.stringify({ ...v, account: "acct-gus" }, null, 2)}\n`);
    expect((await read(await upload(path!, claimed))).body.error).toMatch(/names an account or a project/);
    // Under another card's name, or another time's.
    const elsewhere = path!.replace(id, "B-zzzzz");
    expect((await read(await upload(elsewhere, bytes))).body.error).toMatch(/its name says B-zzzzz/);
    expect((await read(await upload(path!.replace(/^verdicts\/\d{8}/, "verdicts/19990101"), bytes))).body.error).toMatch(/its name says/);
    // A card the relay doesn't have.
    const other = machineStore();
    const unseen = fileCard(other);
    other.addVerdict({ card: unseen, revision: 1, response: "accept", ...REVIEWER });
    const [unseenPath] = written(other, "verdicts");
    expect((await read(await upload(unseenPath!, other.storage.read(unseenPath!)!))).body.error).toMatch(/isn't here yet|has no revision 1 here/);
    // Not a verdict at all.
    expect((await upload(path!, "{}")).status).toBe(400);
    // A rule's retirement before its rule.
    expect((await read(await upload("rules/R-abcde-retired.json", JSON.stringify({ type: "rule-retirement", format: 1, rule: "R-abcde", card: id, by: "gus", at: new Date().toISOString() })))).body.error).toMatch(/rule R-abcde isn't here yet/);
    // The real one goes up, once.
    const taken = await read(await upload(path!, bytes));
    expect(taken.status).toBe(201);
    expect(taken.body.entry).toMatchObject({ path, before_linking: true, machine: "laptop" });
    expect((await read(await upload(path!, bytes))).body).toMatchObject({ unchanged: true });
  });

  it("are kept unsigned and marked, shown as decided, and taken only until the first answer on the website", async () => {
    const project = "proj-b";
    const local = machineStore(new MemoryStorage(), project);
    const early = fileCard(local);
    const later = fileCard(local);
    const open = fileCard(local);
    expect((await push(local, project)).every((r) => r.status === 201)).toBe(true);
    // Answered in the repo, before it was linked: the verdict, a topic merge and a preference change.
    local.addVerdict({ card: early, revision: 1, response: "accept", ...REVIEWER });
    local.mergeTopics(local.card(later)!.meta.topic, local.card(early)!.meta.topic, "gus");
    local.writePreferences({ preset: "today", mode: "shadow" }, { by: "gus", client: "web" });
    local.addVerdict({ card: later, revision: 1, response: "accept", ...REVIEWER });
    const files = [...written(local, "topics"), ...written(local, "preferences"), ...written(local, "verdicts").filter((p) => p.includes(early))];
    for (const p of files) expect((await upload(p, local.storage.read(p)!, { project })).status, p).toBe(201);

    // Kept unsigned, and marked as from before linking, in the log every machine pulls.
    const log = await pullLog(project);
    for (const p of files) {
      const e = log.find((x) => x.path === p)!;
      expect(e.before_linking, p).toBe(true);
      expect(e.sig, p).toBeUndefined();
    }
    // The relay shows the card as decided, from before linking; the others as they are.
    const s = await state(project);
    const card = (id: string) => s.cards.find((c) => c.meta.id === id)!;
    expect(card(early)).toMatchObject({ status: "resolved", before_linking: true });
    expect(card(open).status).toBe("open");
    expect(card(open).before_linking).toBeUndefined();
    expect(s.routing.preferences?.file.mode).toBe("shadow");

    // A machine that pulls them without that record doesn't count them: only the relay trusts the upload (B-45xz8).
    const elsewhere = Store.over(pulled(log), { branch: "main", config: { service: "https://baesian.test", project }, trust: { pinned: pinFrom(log) } });
    expect(elsewhere.status(early)).toBe("open");

    // Someone answers on the website: from then on, nothing more from before linking is taken.
    expect((await answer({ card: open, revision: 1, response: "accept" }, project)).status).toBe(201);
    const late = written(local, "verdicts").find((p) => p.includes(later))!;
    const refused = await read(await upload(late, local.storage.read(late)!, { project }));
    expect(refused.status).toBe(403);
    expect(refused.body.before_linking).toBe("closed");
    expect(refused.body.error).toMatch(/someone has answered on the website since/);
    expect((await state(project)).cards.find((c) => c.meta.id === later)!.status).toBe("open");
    // What it took already stays as it was, and the same bytes again are still nothing new.
    const again = await read(await upload(files[0]!, local.storage.read(files[0]!)!, { project }));
    expect(again.body).toMatchObject({ unchanged: true });
  });
});
