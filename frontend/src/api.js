// api.js
// -----------------------------------------------------------------------
// Thin wrapper around the OptiScript API (server/server.js).
// Uses relative URLs on purpose — vite.config.js proxies them to
// http://localhost:4000 in dev, so no CORS setup is needed.
//
//   compileSource(src)  POST /compile   compiler only
//   runOnDb(src)        POST /run       compiler, then its SQL on the database
//   resetDb()           POST /db/reset  reload the sample schema + data
// -----------------------------------------------------------------------

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return res;
}

// compile() problems live in result.errors and database problems in
// result.dbError (both HTTP 200), so a non-OK status here means the
// request or the server itself is broken (e.g. it isn't running).
async function postForResult(url, body) {
  const res = await post(url, body);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error (${res.status}): ${text}`);
  }
  return res.json();
}

export const compileSource = (source) => postForResult('/compile', { source });
export const runOnDb = (source) => postForResult('/run', { source });

// The reset endpoint reports a database problem as 503 + { message }.
export async function resetDb() {
  const res = await post('/db/reset');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `API error (${res.status})`);
  return data;
}
