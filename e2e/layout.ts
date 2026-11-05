// The layout check, rebuilt from the round 5 quality pass (2026-10-24), whose script was lost with its scratchpad:
// [[2026-10-23 Client Mockups]] records what it looked for. It runs in the page, over what's on screen now, and
// returns each problem as a line of text. Overlays (the menu, the panels, the toast, the flying chip, and the answers
// named at the screen's edges while a card is lifted, B-yfehp) may lie over the desk: that's what they're for. A card
// that's leaving, and anything invisible, is skipped.
//
// It looks for:
// 1. SVG shapes drawn outside their SVG's box, where the SVG clips;
// 2. elements, with their shadows and outlines, cut off by an ancestor that clips them;
// 3. text overlapping text;
// 4. the path's lines crossing text;
// 5. anything off the window;
// 6. text hidden under something painted over it (added in 5f);
// 7. anything that scrolls sideways: the page, or a box that scrolls (added for the phone layout, D130).
//
// A box made to scroll sideways says so (`data-scrolls="sideways"`: the branches panel's lanes, D181): what it scrolls out
// of view at the left or right isn't cut off, off the window, or covered, and its scrolling isn't a problem.
//
// With a modal open (the path's sheet on a phone), only the modal is checked: the rest is behind it on purpose.
// `smallTargets` checks, for a touch screen, that everything you can tap is at least 44 px each way.
//
// Self-contained, so `page.evaluate` can send it to the page.

export function layoutProblems(): string[] {
  const out: string[] = [];
  const W = window.innerWidth;
  const H = window.innerHeight;
  const TOL = 0.75;
  const OVERLAY = ".menu, .panel, .toast, .fly, .lift-signals";
  const TRANSIENT = ".toast, .fly";
  const SIDEWAYS = '[data-scrolls="sideways"]';
  const inSideways = (el: Element) => !!el.parentElement?.closest(SIDEWAYS);
  const modal = document.querySelector('[aria-modal="true"]');

  type Box = { l: number; t: number; r: number; b: number };
  const box = (r: DOMRect): Box => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  const name = (el: Element) => {
    const cls = typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    return `<${el.tagName.toLowerCase()}${cls}>${text ? ` “${text}”` : ""}`;
  };
  const shown = (el: Element): boolean => {
    if (el.closest("[data-leaving]")) return false;
    if (modal && !modal.contains(el) && !el.contains(modal)) return false;
    // A closed <details> hides all but its summary, without display: none.
    const d = el.closest("details");
    if (d && !d.open && !el.closest("summary")) return false;
    for (let e: Element | null = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false;
    }
    const r = el.getBoundingClientRect();
    // A straight line has no height (or no width), and is still drawn.
    return el instanceof SVGGeometryElement ? r.width > 0 || r.height > 0 : r.width > 0 && r.height > 0;
  };
  const overlay = (el: Element) => el.closest(OVERLAY) !== null;

  /** The box an element paints: its border box, its outer shadows, and its outline. */
  const paint = (el: Element): Box => {
    const b = box(el.getBoundingClientRect());
    const cs = getComputedStyle(el);
    if (cs.boxShadow && cs.boxShadow !== "none") {
      for (const s of cs.boxShadow.split(/,(?![^(]*\))/)) {
        if (/\binset\b/.test(s)) continue;
        const n = (s.replace(/rgba?\([^)]*\)|#[0-9a-f]+/gi, "").match(/-?[\d.]+px/g) ?? []).map(parseFloat);
        const [x = 0, y = 0, blur = 0, spread = 0] = n;
        // A Gaussian blur's far half is too faint to see cut off: count half of it.
        const reach = spread + blur / 2;
        if (reach <= 0 && x === 0 && y === 0) continue;
        b.l = Math.min(b.l, b.l + x - reach);
        b.r = Math.max(b.r, b.r + x + reach);
        b.t = Math.min(b.t, b.t + y - reach);
        b.b = Math.max(b.b, b.b + y + reach);
      }
    }
    if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) {
      const o = parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset || "0");
      b.l -= o;
      b.r += o;
      b.t -= o;
      b.b += o;
    }
    return b;
  };

  const all = [...document.querySelectorAll("body *")].filter((el) => !(el instanceof SVGElement && !(el instanceof SVGSVGElement)) && shown(el));

  // 1. SVG shapes outside their SVG's box, when the SVG clips (its overflow isn't visible).
  for (const svg of document.querySelectorAll("svg")) {
    if (!shown(svg) || getComputedStyle(svg).overflow === "visible") continue;
    const frame = box(svg.getBoundingClientRect());
    const vb = svg.viewBox.baseVal;
    const scale = vb && vb.width ? frame.r - frame.l === 0 ? 1 : (frame.r - frame.l) / vb.width : 1;
    for (const shape of svg.querySelectorAll("path, circle, rect, line, polyline, polygon, ellipse")) {
      const r = box(shape.getBoundingClientRect());
      if (r.r - r.l === 0 && r.b - r.t === 0) continue;
      const half = ((parseFloat(getComputedStyle(shape).strokeWidth) || 0) * scale) / 2;
      if (r.l - half < frame.l - TOL || r.t - half < frame.t - TOL || r.r + half > frame.r + TOL || r.b + half > frame.b + TOL) {
        out.push(`svg: a <${shape.tagName}> in ${name(svg.parentElement ?? svg)} is drawn outside its SVG's box, which clips it`);
      }
    }
  }

  // 2. Elements cut off by an ancestor that clips: a scroll container may run on downwards, but not sideways or up.
  for (const el of all) {
    const p = paint(el);
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      if (cs.textOverflow === "ellipsis") break; // truncated on purpose
      const ar = a.getBoundingClientRect();
      const inner = { l: ar.left + a.clientLeft, t: ar.top + a.clientTop, r: ar.left + a.clientLeft + a.clientWidth, b: ar.top + a.clientTop + a.clientHeight };
      const scrolls = cs.overflowY === "auto" || cs.overflowY === "scroll";
      // Scrolled down, it hides what's above on purpose (a long panel, M8b).
      const scrolledUp = scrolls && a.scrollTop > 0;
      const sideways = a.matches(SIDEWAYS);
      const cut = [!sideways && p.l < inner.l - TOL && "left", !sideways && p.r > inner.r + TOL && "right", !scrolledUp && p.t < inner.t - TOL && "top", !scrolls && p.b > inner.b + TOL && "bottom"].filter(Boolean);
      if (cut.length) out.push(`clipped: ${name(el)} is cut off at the ${cut.join(" and ")} by ${name(a).slice(0, 40)}`);
      break;
    }
  }

  // Text, as the rectangles of its lines. A line scrolled out of a box that scrolls (a long card on a phone's desk) isn't
  // on screen, so it can't overlap or be covered: it's skipped.
  const scrolledAway = (el: Element, r: Box): boolean => {
    const y = (r.t + r.b) / 2;
    const x = (r.l + r.r) / 2;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (a.matches(SIDEWAYS)) {
        const ar = a.getBoundingClientRect();
        if (x < ar.left + a.clientLeft || x > ar.left + a.clientLeft + a.clientWidth) return true;
      }
      if (cs.overflowY !== "auto" && cs.overflowY !== "scroll") continue;
      const ar = a.getBoundingClientRect();
      if (y < ar.top + a.clientTop || y > ar.top + a.clientTop + a.clientHeight) return true;
    }
    return false;
  };
  const runs: { el: Element; r: Box; over: boolean }[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim() || !n.parentElement || !shown(n.parentElement)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1 && !scrolledAway(n.parentElement, box(r))) runs.push({ el: n.parentElement, r: box(r), over: overlay(n.parentElement) });
  }

  // 3. Text overlapping text, from different elements. An overlay may cover the desk. Text inside one tilted element
  // (a leaning card) is skipped: a tilt makes each line's upright box taller, so neighbouring lines' boxes meet,
  // but text laid out in one flow can't collide by being turned together.
  const tilted = (el: Element): Element | null => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const m = getComputedStyle(e).transform;
      if (m.startsWith("matrix(") && Math.abs(parseFloat(m.slice(7).split(",")[1] ?? "0")) > 1e-4) return e;
    }
    return null;
  };
  const hit = (a: Box, b: Box, m = 1.5) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > m && Math.min(a.b, b.b) - Math.max(a.t, b.t) > m;
  const seen = new Set<string>();
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i]!, b = runs[j]!;
      if (a.el === b.el || a.over !== b.over || !hit(a.r, b.r)) continue;
      // The toast and your choice's flight come and go over everything, a panel filling a phone's screen included.
      if (a.el.closest(TRANSIENT) || b.el.closest(TRANSIENT)) continue;
      const turned = tilted(a.el);
      if (turned && turned === tilted(b.el)) continue;
      // Glyph boxes overlap by a hair between lines; count it only when the lines really collide.
      const key = `${name(a.el)} / ${name(b.el)}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(`text overlap: ${key}`);
      }
    }
  }

  // 4. The path's lines crossing text.
  for (const line of document.querySelectorAll(".path-lines path")) {
    if (!shown(line) || !(line instanceof SVGPathElement)) continue;
    const m = line.getScreenCTM();
    if (!m) continue;
    const len = line.getTotalLength();
    for (let d = 0; d <= len; d += 3) {
      const q = line.getPointAtLength(d);
      const x = m.a * q.x + m.c * q.y + m.e, y = m.b * q.x + m.d * q.y + m.f;
      const crossed = runs.find((t) => !t.over && x > t.r.l + 1 && x < t.r.r - 1 && y > t.r.t + 2 && y < t.r.b - 2);
      if (crossed) {
        out.push(`line over text: a path line (.${line.getAttribute("class")}) crosses ${name(crossed.el)}`);
        break;
      }
    }
  }

  // 6. Text hidden under something painted over it, such as a card leaning over the path. Found in 5f; round 5's
  // check compared text with text only. Lines and leaving cards don't catch the pointer, so they don't count.
  const covered = new Set<Element>();
  for (const t of runs) {
    if (t.over || covered.has(t.el) || t.el.closest("[style*='ellipsis']") || getComputedStyle(t.el).textOverflow === "ellipsis") continue;
    const y = (t.r.t + t.r.b) / 2;
    for (const x of [t.r.l + 2, (t.r.l + t.r.r) / 2, t.r.r - 2]) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const top = document.elementFromPoint(x, y);
      if (!top || top === t.el || t.el.contains(top) || top.contains(t.el) || overlay(top)) continue;
      covered.add(t.el);
      out.push(`covered: ${name(t.el)} is hidden under ${name(top).slice(0, 50)}`);
      break;
    }
  }

  // 5. Off the window: sideways or above it, and below it for anything fixed in place, unless it's in a scrolling box
  // that fits the window (a long panel, M8b): scrolling reaches it, above or below.
  const scrollsInWindow = (el: Element): boolean => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowY === "auto" || cs.overflowY === "scroll") return a.getBoundingClientRect().bottom <= H + TOL;
    }
    return false;
  };
  for (const el of all) {
    const r = box(el.getBoundingClientRect());
    const fixed = (() => {
      for (let e: Element | null = el; e; e = e.parentElement) if (getComputedStyle(e).position === "fixed") return true;
      return false;
    })();
    const sideways = inSideways(el);
    const off = [!sideways && r.l < -TOL && "left", !sideways && r.r > W + TOL && "right", r.t < -TOL && !scrollsInWindow(el) && "top", fixed && r.b > H + TOL && !scrollsInWindow(el) && "bottom"].filter(Boolean);
    if (off.length) out.push(`off the window: ${name(el)} goes past the ${off.join(" and ")}`);
  }

  // 7. Nothing scrolls sideways: not the page, and not a box that scrolls.
  const page = document.scrollingElement ?? document.documentElement;
  if (page.scrollWidth > W + 1) out.push(`scrolls sideways: the page is ${page.scrollWidth - W}px wider than the window`);
  for (const el of all) {
    const cs = getComputedStyle(el);
    if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1 && !el.matches(SIDEWAYS)) out.push(`scrolls sideways: ${name(el)} is ${el.scrollWidth - el.clientWidth}px wider than its box`);
  }
  return out;
}

/**
 * Everything you can tap that's smaller than `min` px either way (the phone layout, D130): buttons, links, fields,
 * disclosures and menu items. A box or a radio button inside a label is measured by its label, which is what you tap.
 * Hidden things, a card that's leaving, and with a modal open everything behind it, are skipped. Self-contained.
 */
export function smallTargets(min = 44): string[] {
  const out: string[] = [];
  const modal = document.querySelector('[aria-modal="true"]');
  const name = (el: Element) => {
    const cls = typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    return `<${el.tagName.toLowerCase()}${cls}>${text ? ` “${text}”` : ""}`;
  };
  const shown = (el: Element): boolean => {
    if (el.closest("[data-leaving], [inert]")) return false;
    if (modal && !modal.contains(el)) return false;
    const d = el.closest("details");
    if (d && !d.open && !el.closest("summary")) return false;
    for (let e: Element | null = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
    }
    return true;
  };
  const seen = new Set<Element>();
  for (const el of document.querySelectorAll('button, a[href], input, select, textarea, summary, [role^="menuitem"], [tabindex="0"]')) {
    const target = el instanceof HTMLInputElement && el.closest("label") ? el.closest("label")! : el;
    if (seen.has(target) || !shown(target)) continue;
    seen.add(target);
    const r = target.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.width < min - 0.5 || r.height < min - 0.5) out.push(`small target: ${name(target)} is ${Math.round(r.width)}×${Math.round(r.height)} px`);
  }
  return out;
}
