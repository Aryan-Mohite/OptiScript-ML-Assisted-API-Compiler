/**
 * server/dbRunner.js
 * -----------------------------------------------------------------------
 * The bridge between the two independent parts of the project:
 *
 *      compiler/  --- queries --->  [ this file ]  --->  db/ (schema + data)
 *
 * It does exactly two things:
 *   setupDatabase()   create the database, then run db/schema.sql and
 *                     db/data.sql (always leaves a fresh, known state)
 *   runQueries(list)  run the compiler's `queries` against the database
 *                     and report what came back
 *
 * Neither the compiler nor the db/ folder knows this file exists.
 * Queries are run with real `?` placeholders (prepared statements), so
 * values from the DSL can never change the shape of the SQL.
 * -----------------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('./loadEnv')();

const DB_DIR = path.join(__dirname, '..', 'db');

// Read at call time so tests can switch to another database.
function getConfig() {
  return {
    host: process.env.DB_HOST || '127.0.0.1', // not 'localhost': avoids IPv6 surprises
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'optiscript_demo',
    connectTimeout: 5000, // fail fast if MySQL is down
  };
}

/** Creates the database if needed, then loads db/schema.sql + db/data.sql. */
async function setupDatabase() {
  const { database, ...connection } = getConfig();
  if (!/^\w+$/.test(database)) {
    throw new Error(`DB_NAME "${database}" may only contain letters, digits and underscores`);
  }
  // Connect WITHOUT a database first, since it may not exist yet.
  const conn = await mysql.createConnection({ ...connection, multipleStatements: true });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
    await conn.query(`USE \`${database}\``);
    await conn.query(fs.readFileSync(path.join(DB_DIR, 'schema.sql'), 'utf8'));
    await conn.query(fs.readFileSync(path.join(DB_DIR, 'data.sql'), 'utf8'));
  } finally {
    await conn.end();
  }
}

// Connect to the demo database. The very first time it may not exist yet,
// so create it on the spot instead of asking the user to run a command.
async function connect() {
  try {
    return await mysql.createConnection(getConfig());
  } catch (err) {
    if (err.code !== 'ER_BAD_DB_ERROR') throw err;
    await setupDatabase();
    return mysql.createConnection(getConfig());
  }
}

/**
 * Runs the compiler's queries, in order, on one connection.
 * @param {Array<{method,path,sql,params,runnable}>} queries — compile().queries
 * @returns one result per query:
 *   { ...query, status: 'ok', kind: 'select', rows, rowCount }
 *   { ...query, status: 'ok', kind: 'insert', insertId, affectedRows }
 *   { ...query, status: 'skipped', note }       (nothing runnable)
 *   { ...query, status: 'error', error }        (the database said no)
 * Throws only if the database can't be reached at all.
 */
async function runQueries(queries) {
  const conn = await connect();
  try {
    const results = [];
    for (const q of queries) {
      if (!q.runnable) {
        results.push({ ...q, status: 'skipped', note: 'No SQL to run (an INSERT needs a WHERE clause to say what to insert).' });
        continue;
      }
      try {
        const [out] = await conn.execute(q.sql, q.params);
        results.push(
          Array.isArray(out)
            ? { ...q, status: 'ok', kind: 'select', rows: out, rowCount: out.length }
            : { ...q, status: 'ok', kind: 'insert', insertId: out.insertId, affectedRows: out.affectedRows }
        );
      } catch (err) {
        results.push({ ...q, status: 'error', error: err.message });
      }
    }
    return results;
  } finally {
    await conn.end();
  }
}

module.exports = { setupDatabase, runQueries, getConfig };
