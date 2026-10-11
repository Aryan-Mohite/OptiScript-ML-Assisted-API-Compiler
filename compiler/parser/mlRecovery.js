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
 *   - Providers (v2): Google Gemini (free tier, GEMINI_API_KEY) and/or
 *     Anthropic (ANTHROPIC_API_KEY). If both keys exist, Gemini is tried
 *     first (override with ML_PROVIDER=anthropic). If one provider fails,
 *     the other is tried, then the offline heuristic.
 *   - Two kinds of fix: 'replace' a wrong token (GRT -> GET) or 'insert'
 *     a token that is missing (GET /books FIND ... -> insert '->').
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

const TIMEOUT_MS = 8000;

// Model names change over time, so they are overridable from the
// environment (GEMINI_MODEL / ANTHROPIC_MODEL) instead of being buried
// in code. Read at call time so tests can change them.
const geminiModel = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const anthropicModel = () => process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

// Reverse of SYMBOL_TYPE: token type -> its only possible text
// (ARROW -> '->', SLASH -> '/', ...). Needed because the parser often
// calls expect('ARROW') without a value, but ARROW is always '->'.
const SYMBOL_BY_TYPE = Object.fromEntries(Object.entries(SYMBOL_TYPE).map(([v, t]) => [t, v]));

// Every token type the lexer can produce. An ML answer with any other
// type is a hallucination and is rejected.
const VALID_TYPES = new Set(['KEYWORD', 'IDENTIFIER', 'STRING', 'NUMBER', ...Object.values(SYMBOL_TYPE)]);

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

Fix it with exactly ONE token, in one of two ways:
  "replace" = the found token is wrong (a typo), swap it for the correct token
  "insert"  = a token is missing, add it just BEFORE the found token

Return ONLY a single JSON object, no prose, no markdown fences, in exactly this shape:
{"corrected": true, "action": "<replace|insert>", "type": "<KEYWORD|ARROW|SLASH|LPAREN|RPAREN|EQUALS|IDENTIFIER|STRING|NUMBER>", "value": "<the single token text>"}
or, if you cannot confidently fix it:
{"corrected": false}`;
}

// Anything the model returns is untrusted. Accept it only if it has the
// exact expected shape AND a token type the lexer really has.
function isValidPatch(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.corrected === false) return true;
  return (
    obj.corrected === true &&
    typeof obj.type === 'string' &&
    VALID_TYPES.has(obj.type) &&
    typeof obj.value === 'string' &&
    obj.value.length > 0 &&
    (obj.action === undefined || obj.action === 'replace' || obj.action === 'insert')
  );
}

// Turns the raw model text into a validated patch (or null).
function parsePatch(text) {
  try {
    const cleaned = String(text).replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return isValidPatch(parsed) ? parsed : null;
  } catch (err) {
    return null; // not JSON at all
  }
}

// fetch() that gives up after TIMEOUT_MS. Returns the Response or null.
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response.ok ? response : null;
  } catch (err) {
    return null; // timeout (AbortError) or network failure
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(prompt, apiKey) {
  const model = geminiModel();
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
          // 2.5 models "think" by default, which wastes tokens on a
          // one-token fix — turn it off for them.
          ...(/2\.5-flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    }
  );
  if (!response) return null;
  try {
    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    return parsePatch(parts.map((p) => p.text || '').join(''));
  } catch (err) {
    return null;
  }
}

async function callAnthropic(prompt, apiKey) {
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: anthropicModel(),
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response) return null;
  try {
    const data = await response.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return parsePatch(text);
  } catch (err) {
    return null;
  }
}

// Which providers have a key configured, in the order they should be tried.
// Default: Gemini first. ML_PROVIDER=anthropic|gemini puts that one first.
function configuredProviders() {
  const list = [];
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiKey) list.push({ name: 'gemini', call: (p) => callGemini(p, geminiKey) });
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) list.push({ name: 'anthropic', call: (p) => callAnthropic(p, anthropicKey) });

  const preferred = (process.env.ML_PROVIDER || '').toLowerCase();
  list.sort((a, b) => (b.name === preferred) - (a.name === preferred));
  return list;
}

// Tries each configured provider until one returns a usable patch.
// Resolves to { patch, provider } or null (no key / all providers failed).
async function callMlApi(prompt) {
  for (const provider of configuredProviders()) {
    const patch = await provider.call(prompt);
    if (patch) return { patch, provider: provider.name };
  }
  return null;
}

// ---------------------------------------------------------------------
// Phrase-level insertion (no ML needed)
// ---------------------------------------------------------------------

/**
 * If the parser expected exactly ONE possible token and we know its text,
 * that is the token that is missing. e.g. expected ARROW -> '->',
 * expected KEYWORD 'IN' -> 'IN'. Returns null when it would be a guess:
 *   - several choices (GET or POST)
 *   - the text varies (IDENTIFIER, STRING, NUMBER)
 */
function suggestInsertion(options = []) {
  const candidates = [];
  for (const o of options) {
    if (o.value !== undefined && o.value !== null) {
      candidates.push({ type: o.type, value: o.value });
    } else if (SYMBOL_BY_TYPE[o.type]) {
      candidates.push({ type: o.type, value: SYMBOL_BY_TYPE[o.type] });
    }
  }
  return candidates.length === 1 && options.length === 1 ? candidates[0] : null;
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
 * @returns {Promise<{corrected: boolean, type?: string, value?: string,
 *                    action?: 'replace'|'insert', provider?: string, source: string}>}
 *   `source` is 'ml' | 'heuristic' | 'none' — surface this in the React
 *   console panel so the user can see WHERE a fix came from.
 *   `provider` ('gemini' | 'anthropic') is only set when source is 'ml'.
 */
async function attemptRecovery(ctx) {
  const prompt = buildPrompt(ctx);

  const ml = await callMlApi(prompt);
  if (ml && ml.patch.corrected) {
    const { type, value, action } = ml.patch;
    return { corrected: true, type, value, action: action || 'replace', source: 'ml', provider: ml.provider };
  }

  // Fallback 1: heuristic (also the only path taken when there's no API key).
  // A "fix" equal to the token that's already there changes nothing, so
  // it's not a fix (e.g. a stray FIND where '->' was expected).
  const heuristic = heuristicSuggest(ctx.badToken?.value);
  if (heuristic && heuristic.value !== ctx.badToken?.value) {
    return { corrected: true, ...heuristic, action: 'replace', source: 'heuristic' };
  }

  // Fallback 2: give up cleanly — parser.js tries phrase-level insertion,
  // then throws its normal ParserError
  return { corrected: false, source: 'none' };
}

module.exports = { attemptRecovery, heuristicSuggest, levenshtein, suggestInsertion, configuredProviders };
