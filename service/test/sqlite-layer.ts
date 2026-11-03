import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { it } from "vitest";
import { Store } from "../../src/store.js";
import { LAYERS, type LayerIt } from "../../test/helpers.js";
import { SqlFileStorage } from "../src/sql-storage.js";

// B-0ag7h's check: the store's own tests, run over the relay's storage, a Durable Object's SQLite, in workerd. Imported
// before test/store.test.ts, it puts this layer in place of the repo's folder, which needs git and a disk. A test runs
// inside a fresh object, since its storage can only be reached from there.

let current: DurableObjectState | undefined;

/** A test whose body runs inside a fresh project's object, where its SQLite is. */
const inObject: LayerIt = (name, fn) =>
  it(name, () =>
    runInDurableObject(env.PROJECTS.get(env.PROJECTS.newUniqueId()), (_instance, state) => {
      current = state;
      try {
        return fn();
      } finally {
        current = undefined;
      }
    }),
  );

/** A store over the object's SQLite, with no repo, as the relay runs it: it files on `main`, as the other layers do. */
function sqlite(): { store: Store } {
  if (!current) throw new Error("the SQLite layer's store is made inside its test's object");
  return { store: Store.over(new SqlFileStorage(current.storage), { branch: "main" }) };
}

LAYERS.splice(0, LAYERS.length, ["memory, with no repo, in workerd", LAYERS[1]![1], it], ["the relay's SQLite, in a Durable Object", sqlite, inObject]);
