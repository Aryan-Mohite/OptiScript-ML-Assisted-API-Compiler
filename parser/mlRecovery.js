/**
 * mlRecovery.js
 * ------------------------------------------------------------------
 * ML-Powered Error Recovery Interceptor  (Week 4 — Module 2/3 extension)
 *
 * When the parser expects a certain token but finds something else
 * (or nothing at all), this module packages the surrounding context
 * into a strict prompt and asks an LLM for a single corrected token.
 *
 * Contract (per rules.md — this is the part your viva will ask about):
 *   - This function NEVER throws. It always resolves to a plain result
 *     object. All failure modes (missing key, timeout, network error,
 *     bad JSON, hallucinated shape) collapse into `corrected: false`,
 *     so the parser can fall back to its normal ParserError.
 *   - Offline / no-API-key mode: uses a small built-in heuristic
 *     (Levenshtein edit distance against the known keyword/symbol set)
 *     so the pipeline is still demoable without a network connection
 *     or an API key. This heuristic also runs as a second attempt if
 *     the real ML call itself fails.
 * ------------------------------------------------------------------
 */

'use strict';

// Single source of truth: pull the real keyword/symbol set straight from
// the lexer instead of duplicating it here (which drifted from the real
// token types before this fix — lexer.js emits ARROW/SLASH/LPAREN/RPAREN/
// EQUALS as distinct types, not one generic 'SYMBOL').
const { KEYWORDS: LEXER_KEYWORDS, SYMBOLS: LEXER_SYMBOLS } = require('../lexer/lexer');

const KEYWORDS = [...LEXER_KEYWORDS];
// lexer.js's SYMBOLS map doesn't include '->' (ARROW is handled as a
// special two-char case, not through that map) — add it here so the
// heuristic and prompt both know about it.
const SYMBOL_TYPE = { ...LEXER_SYMBOLS, '->': 'ARROW' };
const SYMBOL_VALUES = Object.keys(SYMBOL_TYPE);

const TIMEOUT_MS = 6000;
const MODEL = 'claude-3-5-haiku-20241022'; // small/fast model — this is a single-token fix, not a chat

// ---------------------------------------------------------------------
// Offline heuristic fallback
// ---------------------------------------------------------------------

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function guessType(value) {
  if (KEYWORDS.includes(value)) return 'KEYWORD';
  if (SYMBOL_TYPE[value]) return SYMBOL_TYPE[value];
  return 'IDENTIFIER';
}

/**
 * Finds the closest known keyword/symbol to a bad token's text.
 * Only accepts genuinely close (typo-level) matches so it doesn't
 * make wild guesses on tokens that aren't actually typos.
 */
function heuristicSuggest(badValue) {
  if (!badValue) return null;
  const candidates = [...KEYWORDS, ...SYMBOL_VALUES];
  let best = null;
  let bestDist = Infinity;

  for (const cand of candidates) {
    const dist = levenshtein(String(badValue).trim(), cand);
    if (dist < bestDist) {
      bestDist = dist;
      best = cand;
    }
  }

  if (best !== null && bestDist <= 2) {
    return { type: guessType(best), value: best };
  }
  return null;
}

// ---------------------------------------------------------------------
// ML API call
// ---------------------------------------------------------------------

function buildPrompt({ badToken, expected, contextTokens = [], line }) {
  const contextStr = contextTokens.map((t) => t.value).join(' ');

  return `You are a syntax-error-correction assistant for a tiny DSL compiler called OptiScript.
Grammar keywords: ${KEYWORDS.join(', ')}
Grammar symbols: ${SYMBOL_VALUES.map((v) => `"${v}" (${SYMBOL_TYPE[v]})`).join(', ')}

The parser was on line ${line} and expected: "${expected}".
Instead it found: "${badToken?.value ?? '(nothing / end of input)'}"
Surrounding source context: "${contextStr}"

Return ONLY a single JSON object, no prose, no markdown fences, in exactly this shape:
{"corrected": true, "type": "<KEYWORD|ARROW|SLASH|LPAREN|RPAREN|EQUALS|IDENTIFIER|STRING|NUMBER>", "value": "<the single corrected token text>"}
or, if you cannot confidently fix it:
{"corrected": false}`;
}

function isValidPatch(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.corrected === false) return true;
  return (
    obj.corrected === true &&
    typeof obj.type === 'string' &&
    typeof obj.value === 'string' &&
    obj.value.length > 0
  );
}

async function callMlApi(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null; // no key configured -> caller falls back to heuristic

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const data = await response.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return isValidPatch(parsed) ? parsed : null;
  } catch (err) {
    // Timeout (AbortError), network failure, or bad JSON all land here.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------
// Public entry point — this is what parser.js calls
// ---------------------------------------------------------------------

/**
 * @param {Object} ctx
 * @param {Object|null} ctx.badToken   - the unexpected token (or null at EOF)
 * @param {string} ctx.expected        - human-readable description of what was expected
 * @param {Array}  ctx.contextTokens   - a small window of tokens around the error (for the prompt)
 * @param {number} ctx.line            - source line number
 *
 * @returns {Promise<{corrected: boolean, type?: string, value?: string, source: string}>}
 *   `source` is 'ml' | 'heuristic' | 'none' — surface this in the React
 *   console panel so the user can see WHERE a fix came from.
 */
async function attemptRecovery(ctx) {
  const prompt = buildPrompt(ctx);

  const mlResult = await callMlApi(prompt);
  if (mlResult && mlResult.corrected) {
    return { ...mlResult, source: 'ml' };
  }

  // Fallback 1: heuristic (also the only path taken when there's no API key)
  const heuristic = heuristicSuggest(ctx.badToken?.value);
  if (heuristic) {
    return { corrected: true, ...heuristic, source: 'heuristic' };
  }

  // Fallback 2: give up cleanly — parser.js throws its normal ParserError
  return { corrected: false, source: 'none' };
}

module.exports = { attemptRecovery, heuristicSuggest, levenshtein };
