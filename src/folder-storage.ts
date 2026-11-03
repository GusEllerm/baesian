import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomSuffix } from "./ids.js";
import { type Storage, checkPath } from "./storage.js";

/** A write in progress: a temporary file beside the one it becomes. Never listed. */
const isTemp = (name: string) => name.endsWith(".tmp");

/**
 * The live layer as a folder on your machine (B-0ag7h): `.git/baesian/`, shared by every worktree of a clone (D34), or a
 * commit's record read as a layer in CI. A write goes to a temporary file first, so no other process reads half a file.
 */
export class FolderStorage implements Storage {
  constructor(readonly dir: string) {}

  /** The file or folder at a layer path. */
  private at(path: string): string {
    return checkPath(path, true) === "" ? this.dir : join(this.dir, ...path.split("/"));
  }

  read(path: string): Uint8Array | undefined {
    try {
      return readFileSync(this.at(path));
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return undefined;
      throw e;
    }
  }

  list(dir: string): string[] {
    const at = this.at(dir);
    return existsSync(at) ? readdirSync(at).filter((f) => !isTemp(f)) : [];
  }

  /**
   * Written whole to a temporary file first, then linked into place, which fails if the name is taken: so another process
   * never reads it half-written. An exclusive create alone made the file visible empty for a moment, which the server's
   * four-writer test caught once the gate made filing read more of the layer. Where hard links aren't supported, it falls
   * back to the exclusive create.
   */
  create(path: string, bytes: Uint8Array): void {
    const at = this.at(path);
    mkdirSync(dirname(at), { recursive: true });
    const tmp = `${at}.${randomSuffix()}.tmp`;
    writeFileSync(tmp, bytes, { flag: "wx" });
    try {
      linkSync(tmp, at);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "ENOTSUP" && code !== "EXDEV" && code !== "ENOSYS") throw e;
      writeFileSync(at, bytes, { flag: "wx" });
    } finally {
      rmSync(tmp, { force: true });
    }
  }

  /** Written to a temporary file and renamed over the old one, which is atomic on one file system. */
  replace(path: string, bytes: Uint8Array): void {
    const at = this.at(path);
    mkdirSync(dirname(at), { recursive: true });
    const tmp = `${at}.${randomSuffix()}.tmp`;
    writeFileSync(tmp, bytes);
    renameSync(tmp, at);
  }

  remove(path: string): void {
    rmSync(this.at(path), { force: true });
  }
}
