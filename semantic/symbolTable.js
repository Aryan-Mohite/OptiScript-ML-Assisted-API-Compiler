/**
 * symbolTable.js
 * -----------------------------------------------------------------------
 * OptiScript Symbol Table (Module 3 — Semantic Analysis / SDT)
 *
 * Per rules.md: "The Symbol table must be explicitly implemented and
 * accessible during compilation to manage variable scopes and storage
 * organization" and must act as "the single source of truth for
 * variables and endpoints."
 *
 * OptiScript v1 has no user-declared variables or nested blocks, so
 * there is exactly ONE scope: the global program scope. We still model
 * it as a "scope" object (rather than bare fields) so the concept maps
 * cleanly onto the textbook idea of a symbol table w/ scope, and so it's
 * easy to extend later if OptiScript ever grows nested scopes.
 *
 * Three kinds of symbols get tracked, all inside the single global scope:
 *   1. Routes  — "METHOD /path" endpoint definitions (catches duplicates).
 *   2. Tables  — DB table names referenced by FIND/INSERT actions.
 *   3. Fields  — column/field names referenced in WHERE clauses, scoped
 *                per-table (a Map of table -> Map of field -> info).
 *
 * Usage:
 *   const { SymbolTable } = require('./symbolTable');
 *   const table = new SymbolTable();
 *   table.declareRoute('GET', '/books', 1);
 *   table.declareTable('library_db', 1, 'FIND');
 *   table.declareField('library_db', 'id', 'NUMBER', 1);
 * -----------------------------------------------------------------------
 */

class SymbolTableError extends Error {
  constructor(message, line) {
    super(`SymbolTableError (line ${line}): ${message}`);
    this.name = 'SymbolTableError';
    this.line = line;
  }
}

class SymbolTable {
  constructor() {
    // Single global scope — see file header note.
    this.scope = 'global';

    // "METHOD /path" -> { method, path, line }
    this.routes = new Map();

    // tableName -> { name, firstLine, actions: Set<string>, fields: Map<fieldName, fieldInfo> }
    this.tables = new Map();

    // Soft warnings collected during parsing (non-fatal semantic notes,
    // e.g. a WHERE field used with two different literal types).
    this.warnings = [];
  }

  // ---- Routes ----------------------------------------------------------

  // Registers a route (METHOD + path). Throws SymbolTableError on an
  // exact duplicate definition (e.g. two `GET /books` routes) since that
  // is a genuine semantic conflict, not just a style issue.
  declareRoute(method, path, line) {
    const key = `${method} ${path}`;
    if (this.routes.has(key)) {
      const existing = this.routes.get(key);
      throw new SymbolTableError(
        `Duplicate route definition '${key}' (first defined on line ${existing.line})`,
        line
      );
    }
    this.routes.set(key, { method, path, line });
    return this.routes.get(key);
  }

  // ---- Tables ------------------------------------------------------------

  // Registers (or re-uses) a DB table symbol. Multiple routes may
  // legitimately reference the same table (e.g. GET /books and
  // POST /books both hitting library_db), so this never throws — it just
  // records every action type the table is used with.
  declareTable(name, line, actionType) {
    if (!this.tables.has(name)) {
      this.tables.set(name, {
        name,
        firstLine: line,
        actions: new Set(),
        fields: new Map(),
      });
    }
    const entry = this.tables.get(name);
    entry.actions.add(actionType);
    return entry;
  }

  // ---- Fields (WHERE clause columns), scoped per-table -------------------

  // Registers a field/column used in a WHERE clause against `tableName`.
  // `tableName` must already be declared (parser always calls
  // declareTable() before parsing a WHERE clause for that action).
  declareField(tableName, field, valueType, line) {
    const table = this.tables.get(tableName);
    if (!table) {
      throw new SymbolTableError(
        `Cannot register field '${field}' — unknown table '${tableName}'`,
        line
      );
    }
    if (!table.fields.has(field)) {
      table.fields.set(field, { name: field, valueType, firstLine: line, uses: 1 });
    } else {
      const fieldEntry = table.fields.get(field);
      fieldEntry.uses += 1;
      if (fieldEntry.valueType !== valueType) {
        this.warnings.push(
          `Field '${tableName}.${field}' used with type ${fieldEntry.valueType} ` +
          `(line ${fieldEntry.firstLine}) and later with type ${valueType} (line ${line})`
        );
      }
    }
    return table.fields.get(field);
  }

  // ---- Lookups / reporting helpers ---------------------------------------

  hasRoute(method, path) {
    return this.routes.has(`${method} ${path}`);
  }

  hasTable(name) {
    return this.tables.has(name);
  }

  getTable(name) {
    return this.tables.get(name);
  }

  // Plain-object summary — handy for tests/debug printing and for the
  // Week 8 React console panel later.
  toJSON() {
    return {
      scope: this.scope,
      routes: [...this.routes.values()],
      tables: [...this.tables.values()].map((t) => ({
        name: t.name,
        firstLine: t.firstLine,
        actions: [...t.actions],
        fields: [...t.fields.values()],
      })),
      warnings: this.warnings,
    };
  }
}

module.exports = { SymbolTable, SymbolTableError };
