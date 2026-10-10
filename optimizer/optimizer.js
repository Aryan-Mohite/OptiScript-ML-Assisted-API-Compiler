/**
 * optimizer.js
 * -----------------------------------------------------------------------
 * Code Optimization (Week 6 — Module 5: basic blocks + dead-code
 * elimination), operating on the flat quadruple list icg.js produces.
 *
 * Part A — Basic blocks / flow graph
 *   OptiScript has no loops, branches, or jumps — a compiled program is
 *   always one straight-line sequence of quadruples. So there is, by
 *   construction, exactly ONE basic block per program. `buildBasicBlocks`
 *   still exists (rather than being skipped) so the syllabus concept is
 *   represented correctly rather than assumed away, and so `codegen.js`
 *   (Week 7) has a clean seam to work from if the grammar ever grows
 *   control-flow constructs later.
 *
 * Part B — Dead-code elimination
 *   Classic backward liveness analysis over quadruples:
 *     - ROUTE quads are the program's only observable "output" (they
 *       define the API endpoints, which is the whole point of compiling
 *       OptiScript) — so they're always kept, regardless of whether
 *       anything downstream references their result temp.
 *     - Every other quad is kept only if its result temp is live, i.e.
 *       referenced as an operand by some quad that is itself live.
 *     - Because OptiScript's IR is straight-line (each temp is defined
 *       exactly once, before it's used — no loops/back-edges), a SINGLE
 *       backward pass over the quad list is sufficient; no fixed-point
 *       worklist iteration is needed the way a real control-flow graph
 *       would require.
 *
 *   NOTE: because icg.js always wires every temp into exactly one
 *   downstream consumer, a *valid* OptiScript program never actually
 *   contains dead code today — there's no unused-variable concept in
 *   this DSL. This module is still correct and useful: see
 *   test-optimizer.js for hand-built quadruple lists with genuinely
 *   dead defs (standard practice for testing an IR-level pass
 *   independently of the frontend), alongside real compiled programs
 *   that correctly show zero removals.
 * -----------------------------------------------------------------------
 */

'use strict';

// Ops whose quad must always survive optimization — the compiled
// program's observable effects. Everything else is only kept if it
// feeds one of these (directly or transitively).
const ALWAYS_LIVE_OPS = new Set(['ROUTE']);

function isTemp(value) {
  return typeof value === 'string' && /^T\d+$/.test(value);
}

// ---------------------------------------------------------------------
// Part A: Basic blocks
// ---------------------------------------------------------------------

/**
 * OptiScript has no control flow, so this always returns a single block
 * spanning the whole quad list. Kept as its own function (not inlined)
 * so the "flow graph" step is explicit and named, per Module 5.
 */
function buildBasicBlocks(quads) {
  if (quads.length === 0) return [];
  return [{ id: 'B0', start: 0, end: quads.length - 1, quads: [...quads] }];
}

// ---------------------------------------------------------------------
// Part B: Dead-code elimination
// ---------------------------------------------------------------------

/**
 * @param {Array<{op, arg1, arg2, result}>} quads
 * @returns {{ optimized: Array, removed: Array }}
 */
function eliminateDeadCode(quads) {
  const liveTemps = new Set();
  const liveIndices = new Set();

  // Single backward pass: by the time we reach quad i, we already know
  // (from quads i+1..end) which temps are live, because every temp is
  // defined before it's used in this straight-line IR.
  for (let i = quads.length - 1; i >= 0; i--) {
    const q = quads[i];
    const isRoot = ALWAYS_LIVE_OPS.has(q.op);
    const resultIsLive = isTemp(q.result) && liveTemps.has(q.result);

    if (isRoot || resultIsLive) {
      liveIndices.add(i);
      if (isTemp(q.arg1)) liveTemps.add(q.arg1);
      if (isTemp(q.arg2)) liveTemps.add(q.arg2);
      // A root op's `result` field (e.g. ROUTE's) is, per icg.js's
      // design, a REFERENCE to the upstream action's temp — not a new
      // definition, since nothing ever consumes "the route's own temp"
      // further downstream. So for root ops specifically, result must
      // also be treated as a use, or the quad that actually produced
      // that temp (SELECT/INSERT) would incorrectly look unused.
      if (isRoot && isTemp(q.result)) liveTemps.add(q.result);
    }
  }

  const optimized = [];
  const removed = [];
  quads.forEach((q, i) => (liveIndices.has(i) ? optimized : removed).push(q));

  return { optimized, removed };
}

/**
 * Convenience wrapper: runs basic-block analysis then DCE, and returns
 * enough detail for a before/after report (Week 6 deliverable per the
 * plan: "before/after quadruple comparison for your report").
 */
function optimize(quads) {
  const blocks = buildBasicBlocks(quads);
  const { optimized, removed } = eliminateDeadCode(quads);
  return { blocks, before: quads, optimized, removed };
}

module.exports = { buildBasicBlocks, eliminateDeadCode, optimize, ALWAYS_LIVE_OPS, isTemp };
