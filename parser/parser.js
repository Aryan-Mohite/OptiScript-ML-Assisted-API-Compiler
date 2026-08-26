/**
 * parser.js
 * -----------------------------------------------------------------------
 * OptiScript Parser (Module 2 — Syntax Analysis)
 *
 * Hand-written recursive-descent PREDICTIVE (LL) parser — one function
 * per grammar rule in docs/cfg.md. No parser generators / ANTLR, per
 * rules.md. Builds a plain-object AST (per phases.md: "plain JS objects
 * {type, children, value}").
 *
 * Week 3 update (Module 3 — SDT & Symbol Table): the parser now builds a
 * SymbolTable as it goes, registering every route, table, and WHERE-clause
 * field the moment it recognizes them. See semantic/symbolTable.js.
 *
 * Usage:
 *   const { tokenize } = require('../lexer/lexer');
 *   const { parse } = require('./parser');
 *   const { ast, symbolTable } = parse(tokenize('GET /books -> FIND all IN library_db'));
 * -----------------------------------------------------------------------
 */

const { SymbolTable } = require('../semantic/symbolTable');

class ParserError extends Error {
  constructor(message, line) {
    super(`ParserError (line ${line}): ${message}`);
    this.name = 'ParserError';
    this.line = line;
  }
}

class Parser {
  // `symbolTable` is optional — if the caller doesn't pass one, the
  // parser creates its own so it can still be used standalone (e.g. in
  // lexer/parser-only unit tests) without forcing every caller to wire
  // semantic analysis in themselves.
  constructor(tokens, symbolTable) {
    this.tokens = tokens;
    this.pos = 0;
    this.symbolTable = symbolTable || new SymbolTable();
  }

  // ---- low-level token helpers ----

  peek(offset = 0) {
    return this.tokens[this.pos + offset];
  }

  current() {
    return this.tokens[this.pos];
  }

  isAtEnd() {
    return this.current().type === 'EOF';
  }

  advance() {
    const tok = this.current();
    if (!this.isAtEnd()) this.pos++;
    return tok;
  }

  // True if current token matches type (and optionally value)
  check(type, value) {
    const tok = this.current();
    if (tok.type !== type) return false;
    if (value !== undefined && tok.value !== value) return false;
    return true;
  }

  // Consume current token if it matches type (+ optional value), else
  // throw a typed ParserError with a helpful "expected X, found Y" msg.
  expect(type, value, message) {
    if (this.check(type, value)) {
      return this.advance();
    }
    const tok = this.current();
    const expected = value !== undefined ? `${type} '${value}'` : type;
    const found = tok.value !== null ? `${tok.type} '${tok.value}'` : tok.type;
    throw new ParserError(
      message || `Expected ${expected} but found ${found}`,
      tok.line
    );
  }

  // ---- grammar rule functions (one per rule in docs/cfg.md) ----

  // <program> ::= <statement>* EOF
  parseProgram() {
    const body = [];
    while (!this.isAtEnd()) {
      body.push(this.parseStatement());
    }
    return { type: 'Program', body };
  }

  // <statement> ::= <routeStatement>
  parseStatement() {
    return this.parseRouteStatement();
  }

  // <routeStatement> ::= <method> <path> ARROW <action>
  parseRouteStatement() {
    const line = this.current().line;
    const method = this.parseMethod();
    const path = this.parsePath();
    // Register the endpoint in the symbol table as soon as we know the
    // full method + path — this is also where a duplicate-route
    // SymbolTableError would surface, before we even look at the action.
    const pathString = '/' + path.segments.join('/');
    this.symbolTable.declareRoute(method, pathString, line);
    this.expect('ARROW', undefined, "Expected '->' after route path");
    const action = this.parseAction();
    return { type: 'RouteStatement', method, path, action, line };
  }

  // <method> ::= "GET" | "POST"
  parseMethod() {
    if (this.check('KEYWORD', 'GET') || this.check('KEYWORD', 'POST')) {
      return this.advance().value;
    }
    const tok = this.current();
    throw new ParserError(
      `Expected route method 'GET' or 'POST' but found ${tok.type} '${tok.value}'`,
      tok.line
    );
  }

  // <path> ::= ( SLASH <pathSegment> )+
  parsePath() {
    const segments = [];
    // must have at least one segment
    this.expect('SLASH', undefined, "Expected '/' to start route path");
    segments.push(this.parsePathSegment());
    while (this.check('SLASH')) {
      this.advance();
      segments.push(this.parsePathSegment());
    }
    return { type: 'Path', segments };
  }

  // <pathSegment> ::= IDENTIFIER | NUMBER
  parsePathSegment() {
    if (this.check('IDENTIFIER') || this.check('NUMBER')) {
      return this.advance().value;
    }
    const tok = this.current();
    throw new ParserError(
      `Expected identifier or number in path but found ${tok.type} '${tok.value}'`,
      tok.line
    );
  }

  // <action> ::= <findAction> | <insertAction>
  parseAction() {
    if (this.check('KEYWORD', 'FIND')) return this.parseFindAction();
    if (this.check('KEYWORD', 'INSERT')) return this.parseInsertAction();
    const tok = this.current();
    throw new ParserError(
      `Expected action 'FIND' or 'INSERT' but found ${tok.type} '${tok.value}'`,
      tok.line
    );
  }

  // <findAction> ::= "FIND" "all" "IN" IDENTIFIER <whereClause>?
  parseFindAction() {
    const line = this.current().line;
    this.expect('KEYWORD', 'FIND');
    this.expect('KEYWORD', 'all', "Expected 'all' after FIND");
    this.expect('KEYWORD', 'IN', "Expected 'IN' after 'all'");
    const table = this.expect('IDENTIFIER', undefined, 'Expected table name after IN').value;
    this.symbolTable.declareTable(table, line, 'FIND');
    const where = this.check('KEYWORD', 'WHERE') ? this.parseWhereClause(table) : null;
    return { type: 'FindAction', table, where, line };
  }

  // <insertAction> ::= "INSERT" "INTO" IDENTIFIER <whereClause>?
  parseInsertAction() {
    const line = this.current().line;
    this.expect('KEYWORD', 'INSERT');
    this.expect('KEYWORD', 'INTO', "Expected 'INTO' after INSERT");
    const table = this.expect('IDENTIFIER', undefined, 'Expected table name after INTO').value;
    this.symbolTable.declareTable(table, line, 'INSERT');
    const where = this.check('KEYWORD', 'WHERE') ? this.parseWhereClause(table) : null;
    return { type: 'InsertAction', table, where, line };
  }

  // <whereClause> ::= "WHERE" IDENTIFIER EQUALS ( STRING | NUMBER )
  // `tableName` is passed in by the caller (parseFindAction /
  // parseInsertAction) so the field can be registered in the symbol
  // table under the correct table's field scope.
  parseWhereClause(tableName) {
    const line = this.current().line;
    this.expect('KEYWORD', 'WHERE');
    const field = this.expect('IDENTIFIER', undefined, 'Expected field name after WHERE').value;
    this.expect('EQUALS', undefined, "Expected '=' in WHERE clause");
    let value, valueType;
    if (this.check('STRING')) {
      value = this.advance().value;
      valueType = 'STRING';
    } else if (this.check('NUMBER')) {
      value = this.advance().value;
      valueType = 'NUMBER';
    } else {
      const tok = this.current();
      throw new ParserError(
        `Expected string or number after '=' but found ${tok.type} '${tok.value}'`,
        tok.line
      );
    }
    this.symbolTable.declareField(tableName, field, valueType, line);
    return { type: 'WhereClause', field, operator: '=', value, valueType, line };
  }
}

// Returns { ast, symbolTable } — the symbol table is populated as a
// side effect of parsing (Week 3), not a separate pass.
function parse(tokens, symbolTable) {
  const parser = new Parser(tokens, symbolTable);
  const ast = parser.parseProgram();
  return { ast, symbolTable: parser.symbolTable };
}

module.exports = { parse, Parser, ParserError };
