// api.js
// -----------------------------------------------------------------------
// Thin wrapper around the OptiScript compiler backend (server.js, Week 7).
// Uses relative URLs ('/compile') on purpose — vite.config.js proxies
// those to http://localhost:4000 in dev, so no CORS setup is needed and
// this same code works unchanged if the frontend is ever served by the
// same origin as the backend.
// -----------------------------------------------------------------------

export async function compileSource(source) {
  const res = await fetch('/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });

  // compiler.js/server.js always respond 200 with a JSON body — even a
  // compile failure lives in result.errors, not the HTTP status — so a
  // non-200 here means something is actually wrong with the request or
  // the server itself (e.g. it isn't running).
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Compiler API error (${res.status}): ${text}`);
  }

  return res.json();
}
