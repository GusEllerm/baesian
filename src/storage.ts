// The live layer's storage (B-0ag7h): what the store needs of a folder of files, and nothing more, so the same store
// runs over a folder on your machine (`FolderStorage`, src/folder-storage.ts) and, on the relay, over a table in a
// Durable Object (M9b). This module imports nothing from Node, so the relay can import it.

/**
 * The live layer's files (B-0ag7h). Paths are relative to the layer, `/`-separated, with no leading slash: `presence.json`,
 * `cards/B-7f3kq/r1.md`. Every call is synchronous, as a Durable Object's SQLite storage is. No time is stored with a
 * file: whatever goes stale, presence and waiting markers, says when it was written in its own `at` (D41, D90).
 */
export interface Storage {
  /** A file's bytes, or undefined when there's none. */
  read(path: string): Uint8Array | undefined;
  /**
   * The names in a folder, files and folders alike, in no particular order. A folder exists while it holds a file, so
   * one that doesn't lists nothing. A write in progress is never listed.
   */
  list(dir: string): string[];
  /**
   * Write a file that never changes (D34): whole, and only once. Throws an error whose `code` is `EEXIST` when the path
   * is taken, so a second write fails. No reader ever sees the file half-written.
   */
  create(path: string, bytes: Uint8Array): void;
  /** Write a mutable file, replacing what's there: a reader sees the old bytes or the new, never part of either. */
  replace(path: string, bytes: Uint8Array): void;
  /** Remove a file, if it's there. */
  remove(path: string): void;
}

/** A write-once file is already there: `Storage.create` refuses to write it again. Its `code` is Node's, `EEXIST`. */
export class FileExists extends Error {
  readonly code = "EEXIST";
  constructor(readonly path: string) {
    super(`${path} is already written: a file is written once`);
  }
}

/** Whether an error says the file was already there: a `FileExists`, or Node's own `EEXIST`. */
export function alreadyExists(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "EEXIST";
}

/** A path the store can name: relative, `/`-separated, with no empty, `.` or `..` part. The root folder is "". */
export function checkPath(path: string, root = false): string {
  if (root && path === "") return path;
  if (path.split("/").some((p) => p === "" || p === "." || p === "..") || path.includes("\\")) throw new Error(`not a path in the live layer: ${JSON.stringify(path)}`);
  return path;
}

const copy = (bytes: Uint8Array) => new Uint8Array(bytes);

/**
 * The live layer in memory (B-0ag7h): one entry per file, keyed by its path, as the relay's table will be. It stands in
 * for the Durable Object's storage in tests, and in anything that runs the store with no repo. What it hands out is a
 * copy, so nothing can change a file after it's written.
 */
export class MemoryStorage implements Storage {
  private readonly files = new Map<string, Uint8Array>();

  read(path: string): Uint8Array | undefined {
    const bytes = this.files.get(checkPath(path));
    return bytes && copy(bytes);
  }

  list(dir: string): string[] {
    const prefix = checkPath(dir, true) === "" ? "" : `${dir}/`;
    const names = new Set<string>();
    for (const path of this.files.keys()) if (path.startsWith(prefix)) names.add(path.slice(prefix.length).split("/")[0]!);
    return [...names];
  }

  create(path: string, bytes: Uint8Array): void {
    if (this.files.has(checkPath(path))) throw new FileExists(path);
    this.files.set(path, copy(bytes));
  }

  replace(path: string, bytes: Uint8Array): void {
    this.files.set(checkPath(path), copy(bytes));
  }

  remove(path: string): void {
    this.files.delete(checkPath(path));
  }

  /** Every file's path, sorted. */
  paths(): string[] {
    return [...this.files.keys()].sort();
  }
}
