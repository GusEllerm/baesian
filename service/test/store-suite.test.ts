// The store's own suites (test/store.test.ts, `LAYERS`), over the relay's SQLite and memory, in workerd (B-0ag7h).
// Run by vitest.store.config.ts, which keeps only the suites that run over a layer: the rest need git and a disk.
import "./sqlite-layer.js";
import "../../test/store.test.js";
