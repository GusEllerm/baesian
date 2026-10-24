// The client mockup vote (D64). Marks autosave to localStorage; "Send ballot" POSTs to serve.mjs.

const DIRECTIONS = [
  {
    id: "provenance",
    name: "Provenance",
    concept: "The decision is a manila tag on a string, tied by threads to its sources. Answering stamps it, and it swings away.",
    keep: ["The hanging tag", "Threads from card lines to sources", "Rubber-stamp answers", "Pinned source slips", "Mauve and manila palette", "Alegreya with Archivo"],
  },
  {
    id: "notebook",
    name: "Notebook",
    concept: "An entry on a graph-paper page. The contents list the queue in priority order; the margin holds the graph of the work.",
    keep: ["The margin graph of the work", "Numbered contents (priority order)", "Run-in section heads", "Graph paper and the 22 px rhythm", "Ultramarine and white palette", "Keycap answer buttons"],
  },
  {
    id: "signal",
    name: "Signal",
    concept: "The screen's four edges are the four answers. Hold an arrow to lean the card toward one, let go to send it.",
    keep: ["The frame of answers", "The very large condensed question", "Proposal beside the strongest alternative", "Lean-and-release motion", "The sources drawer", "White with signal colours"],
  },
];

const DIMS = [
  ["typography", "Typography"],
  ["palette", "Palette"],
  ["layout", "Layout"],
  ["speed", "Can you judge a card in 10 seconds?"],
  ["provenance", "Is it clear where the card comes from?"],
  ["polish", "Does it feel polished?"],
  ["motion", "Keyboard and motion feel"],
];

const KEY = "baesian-vote-v1";
const state = JSON.parse(localStorage.getItem(KEY) || "null") || {
  version: 1,
  directions: Object.fromEntries(DIRECTIONS.map((d) => [d.id, { overall: null, dims: {}, keep: [], notes: "" }])),
  ranking: ["", "", ""],
  final: "",
  mix: "",
  notes: "",
};
const save = () => localStorage.setItem(KEY, JSON.stringify(state));
let current = DIRECTIONS[0].id;

function scale(value, onPick) {
  const wrap = document.createElement("div");
  wrap.className = "scale";
  for (let n = 1; n <= 5; n++) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = String(n);
    b.setAttribute("aria-pressed", String(value === n));
    b.addEventListener("click", () => onPick(value === n ? null : n));
    wrap.appendChild(b);
  }
  return wrap;
}

function renderTabs() {
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = "";
  for (const d of DIRECTIONS) {
    const t = document.createElement("button");
    t.className = "tab";
    t.type = "button";
    t.role = "tab";
    t.textContent = d.name;
    t.setAttribute("aria-selected", String(d.id === current));
    t.addEventListener("click", () => { current = d.id; render(); });
    tabs.appendChild(t);
  }
}

function renderBallot() {
  const d = DIRECTIONS.find((x) => x.id === current);
  const s = state.directions[d.id];
  const form = document.getElementById("ballot");
  form.innerHTML = `<h2>${d.name}</h2><p class="concept">${d.concept}</p>`;
  const row = (label, cls, value, set) => {
    const r = document.createElement("div");
    r.className = "row";
    const l = document.createElement("label");
    l.textContent = label;
    if (cls) l.className = cls;
    r.append(l, scale(value, (v) => { set(v); save(); renderBallot(); }));
    form.appendChild(r);
  };
  row("Overall", "overall", s.overall, (v) => { s.overall = v; });
  for (const [key, label] of DIMS) row(label, "", s.dims[key] ?? null, (v) => { s.dims[key] = v; });

  const keep = document.createElement("fieldset");
  keep.className = "keep";
  keep.innerHTML = "<legend>Worth keeping, whatever wins</legend>";
  for (const k of d.keep) {
    const l = document.createElement("label");
    const c = document.createElement("input");
    c.type = "checkbox";
    c.checked = s.keep.includes(k);
    c.addEventListener("change", () => {
      s.keep = c.checked ? [...s.keep, k] : s.keep.filter((x) => x !== k);
      save();
    });
    l.append(c, document.createTextNode(k));
    keep.appendChild(l);
  }
  form.appendChild(keep);

  const notes = document.createElement("fieldset");
  notes.innerHTML = "<legend>Notes on this one</legend>";
  const ta = document.createElement("textarea");
  ta.value = s.notes;
  ta.addEventListener("input", () => { s.notes = ta.value; save(); });
  notes.appendChild(ta);
  form.appendChild(notes);
}

function renderFinal() {
  const r = document.getElementById("ranking");
  r.innerHTML = "";
  ["First choice", "Second", "Third"].forEach((label, i) => {
    const l = document.createElement("label");
    l.textContent = label;
    const sel = document.createElement("select");
    sel.innerHTML = `<option value="">—</option>${DIRECTIONS.map((d) => `<option value="${d.id}">${d.name}</option>`).join("")}`;
    sel.value = state.ranking[i] || "";
    sel.addEventListener("change", () => { state.ranking[i] = sel.value; if (i === 0) state.final = sel.value; save(); });
    r.append(l, sel, document.createElement("span"));
  });
  const mix = document.getElementById("mix");
  mix.value = state.mix;
  mix.oninput = () => { state.mix = mix.value; save(); };
  const notes = document.getElementById("notes");
  notes.value = state.notes;
  notes.oninput = () => { state.notes = notes.value; save(); };
}

function render() {
  renderTabs();
  const src = `../explorations/${current}/index.html`;
  const frame = document.getElementById("frame");
  if (frame.getAttribute("src") !== src) frame.setAttribute("src", src);
  document.getElementById("open").href = src;
  renderBallot();
}

document.getElementById("send").addEventListener("click", async () => {
  const status = document.getElementById("status");
  status.textContent = "Sending…";
  try {
    const res = await fetch("/api/vote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...state, sentAt: new Date().toISOString() }) });
    const body = await res.json();
    status.textContent = res.ok ? `Saved to ${body.saved}. You can keep editing and send again.` : "The server refused the ballot.";
  } catch {
    status.textContent = "Couldn't reach the vote server. Is `node design/vote/serve.mjs` running?";
  }
});

render();
renderFinal();
