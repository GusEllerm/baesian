import { Store } from "../../src/store.js";

// A writer process for the server tests: files `n` cards into the repo at `dir`, as one agent would.
// Usage: node --import <tsx loader> test/fixtures/file-cards.ts <dir> <writer> <n>

const [dir, writer, n] = process.argv.slice(2);
const store = Store.open(dir);
for (let i = 0; i < Number(n); i++) {
  store.fileCard(
    {
      title: `Load card ${writer}-${i}`,
      question: `Which option for load case ${writer}-${i}?`,
      doing: "running the server's load test",
      topic: `load/w${writer}-c${i}`,
      reverse: "cheap",
      proposal: "Option A",
      proposal_then: "A happens",
      alternative: "Option B",
      alternative_then: "B happens",
      crux: "Does A fit?",
      crux_proposal: "If it does",
      crux_alternative: "If it doesn't",
    },
    "",
    { agent: `writer-${writer}`, force: true },
  );
}
