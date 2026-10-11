/**
 * icg.js
 * -----------------------------------------------------------------------
 * Intermediate Code Generation (Week 5 — Module 4: Aho/Ullman-style
 * quadruples: Operator, Arg1, Arg2, Result).
 *
 * Walks the AST that parser.js produces (Program -> RouteStatement[] ->
 * FindAction/InsertAction -> WhereClause?) and emits a flat list of
 * quadruples per program, using temp variables (T1, T2, ...) to name
 * intermediate results — exactly the way the textbook examples chain
 * arithmetic expressions through temps, just applied to route/DB actions
 * instead of `a + b * c`.
 *
 * Per route statement, up to 3 quadruples are emitted, in this order:
 *   1. (EQ, field, value, T1)        <- only if a WHERE clause is present
 *   2. (SELECT|INSERT, table, T1|_, T2)  <- the DB action itself
 *   3. (ROUTE, method, path, T2)     <- binds the endpoint to its result
 *
 * This module has NO knowledge of the symbol table or of dead-code
 * elimination (Week 6) — it's a pure, one-directional AST -> IR pass,
 * per rules.md's "each phase is its own independent module".
 * -----------------------------------------------------------------------
 */

'use strict';

class Quadruple {
  constructor(op, arg1, arg2, result) {
    this.op = op;
    this.arg1 = arg1;
    this.arg2 = arg2;
    this.result = result;
  }

  // Textbook-style print: (OP, arg1, arg2, result), '_' for an unused slot.
  toString() {
    const a1 = this.arg1 === null || this.arg1 === undefined ? '_' : this.arg1;
    const a2 = this.arg2 === null || this.arg2 === undefined ? '_' : this.arg2;
    return `(${this.op}, ${a1}, ${a2}, ${this.result})`;
  }
}

class ICG {
  constructor() {
    this.quads = [];
    this.tempCount = 0;
  }

  // T1, T2, T3, ... — one counter for the whole program, textbook style.
  newTemp() {
    this.tempCount += 1;
    return `T${this.tempCount}`;
  }

  emit(op, arg1, arg2, result) {
    const q = new Quadruple(op, arg1, arg2, result);
    this.quads.push(q);
    return q;
  }

  // Program -> flat quadruple list, one route's worth of quads after another.
  generate(ast) {
    for (const stmt of ast.body) {
      this.genRouteStatement(stmt);
    }
    return this.quads;
  }

  // <routeStatement> -> ROUTE quad, wired to the action's result temp
  genRouteStatement(stmt) {
    const pathStr = '/' + stmt.path.segments.join('/');
    const actionTemp = this.genAction(stmt.action);
    this.emit('ROUTE', stmt.method, pathStr, actionTemp);
  }

  // <findAction> | <insertAction> -> SELECT|INSERT quad -> new temp
  genAction(action) {
    const whereTemp = action.where ? this.genWhereClause(action.where) : null;
    const resultTemp = this.newTemp();

    if (action.type === 'FindAction') {
      this.emit('SELECT', action.table, whereTemp, resultTemp);
    } else if (action.type === 'InsertAction') {
      this.emit('INSERT', action.table, whereTemp, resultTemp);
    } else {
      // Defensive — parser.js should never hand us anything else, but a
      // typed error here beats a silent wrong quadruple if the grammar
      // grows a new action kind later without icg.js being updated.
      throw new Error(`icg.js: unknown action type '${action.type}'`);
    }

    return resultTemp;
  }

  // <whereClause> -> EQ quad -> new temp holding the condition
  genWhereClause(where) {
    const temp = this.newTemp();
    // Quote string literals in the printed quad so "Dune" and 1 aren't
    // visually ambiguous when you're staring at a quadruple dump.
    const valueOperand = where.valueType === 'STRING' ? `"${where.value}"` : where.value;
    this.emit('EQ', where.field, valueOperand, temp);
    return temp;
  }
}

// Convenience entry point: AST -> quadruple array, fresh ICG instance
// per call so temp counters never leak across separate compiles.
function generateQuadruples(ast) {
  return new ICG().generate(ast);
}

module.exports = { generateQuadruples, ICG, Quadruple };
