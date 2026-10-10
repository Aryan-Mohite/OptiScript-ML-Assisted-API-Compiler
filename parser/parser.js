
 // parser.js

const { SymbolTable } = require('../semantic/symbolTable');
const { attemptRecovery } = require('./mlRecovery');

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
    // Week 4: every successful ML/heuristic fix gets logged here so the
    // Week 8 React console panel can show "ML fixed 'GRT' -> 'GET' on
    // line 1" distinctly from a hard error.
    this.recoveryLog = [];
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
  // try ML-powered recovery before falling back to a typed ParserError.
  // (Week 4: was synchronous and threw immediately — now async because
  // recovery involves an API call.)
  async expect(type, value, message) {
    if (this.check(type, value)) {
      return this.advance();
    }
    return this._recoverOrThrow([{ type, value }], message);
  }

  // Like expect(), but for the choice points in the grammar where several
  // token shapes are acceptable (e.g. route method is GET *or* POST).
  // Consumes and returns the token if the current one matches any option.
  async expectOneOf(options, message) {
    for (const opt of options) {
      if (this.check(opt.type, opt.value)) {
        return this.advance();
      }
    }
    return this._recoverOrThrow(options, message);
  }

  // Shared chokepoint for every "unexpected token" case in the grammar
  // (Week 4). Packages context, asks mlRecovery.attemptRecovery() for a
  // fix, and either splices the corrected token into the stream and
  // retries, or throws the normal typed ParserError — never anything else.
  async _recoverOrThrow(options, message) {
    const tok = this.isAtEnd() ? null : this.current();
    const prevLine = this.pos > 0 ? this.tokens[this.pos - 1].line : 1;
    const expectedDesc = options
      .map((o) => (o.value !== undefined ? `${o.type} '${o.value}'` : o.type))
      .join(' or ');

    const recovery = await attemptRecovery({
      badToken: tok,
      expected: expectedDesc,
      contextTokens: this.tokens.slice(Math.max(0, this.pos - 2), this.pos + 2),
      line: tok ? tok.line : prevLine,
    });

    if (recovery.corrected) {
      const fixedToken = { type: recovery.type, value: recovery.value, line: tok ? tok.line : prevLine };

      if (tok) {
        this.tokens[this.pos] = fixedToken; // replace the wrong token
      } else {
        this.tokens.splice(this.pos, 0, fixedToken); // insert a missing token at EOF
      }

      // Retry now that the stream is patched. If the suggested fix STILL
      // doesn't satisfy any option — e.g. the bad token was itself a
      // valid keyword elsewhere (a stray 'FIND' where '->' was expected),
      // so the heuristic matched it to itself and changed nothing — fall
      // through below instead of looping forever or logging a fake fix.
      for (const opt of options) {
        if (this.check(opt.type, opt.value)) {
          this.recoveryLog.push({ ...recovery, expected: expectedDesc, position: this.pos, line: fixedToken.line });
          return this.advance();
        }
      }

      // Fix didn't help — undo the splice/replace so the error message
      // below reports the ORIGINAL bad token, not the patched one.
      if (tok) {
        this.tokens[this.pos] = tok;
      } else {
        this.tokens.splice(this.pos, 1);
      }
    }

    const found = tok ? (tok.value !== null ? `${tok.type} '${tok.value}'` : tok.type) : 'EOF';
    throw new ParserError(
      message || `Expected ${expectedDesc} but found ${found}`,
      tok ? tok.line : prevLine
    );
  }

  // ---- grammar rule functions (one per rule in docs/cfg.md) ----
  // Week 4: every one of these is now async, since any of them may hit
  // an expect()/expectOneOf() call that goes through ML recovery.

  // <program> ::= <statement>* EOF
  async parseProgram() {
    const body = [];
    while (!this.isAtEnd()) {
      body.push(await this.parseStatement());
    }
    return { type: 'Program', body };
  }

  // <statement> ::= <routeStatement>
  async parseStatement() {
    return this.parseRouteStatement();
  }

  // <routeStatement> ::= <method> <path> ARROW <action>
  async parseRouteStatement() {
    const line = this.current().line;
    const method = await this.parseMethod();
    const path = await this.parsePath();
    // Register the endpoint in the symbol table as soon as we know the
    // full method + path — this is also where a duplicate-route
    // SymbolTableError would surface, before we even look at the action.
    const pathString = '/' + path.segments.join('/');
    this.symbolTable.declareRoute(method, pathString, line);
    await this.expect('ARROW', undefined, "Expected '->' after route path");
    const action = await this.parseAction();
    return { type: 'RouteStatement', method, path, action, line };
  }

  // <method> ::= "GET" | "POST"
  async parseMethod() {
    const tok = await this.expectOneOf(
      [{ type: 'KEYWORD', value: 'GET' }, { type: 'KEYWORD', value: 'POST' }],
      undefined
    );
    return tok.value;
  }

  // <path> ::= ( SLASH <pathSegment> )+
  async parsePath() {
    const segments = [];
    // must have at least one segment
    await this.expect('SLASH', undefined, "Expected '/' to start route path");
    segments.push(await this.parsePathSegment());
    while (this.check('SLASH')) {
      this.advance();
      segments.push(await this.parsePathSegment());
    }
    return { type: 'Path', segments };
  }

  // <pathSegment> ::= IDENTIFIER | NUMBER
  async parsePathSegment() {
    const tok = await this.expectOneOf(
      [{ type: 'IDENTIFIER' }, { type: 'NUMBER' }],
      undefined
    );
    return tok.value;
  }

  // <action> ::= <findAction> | <insertAction>
  async parseAction() {
    if (this.check('KEYWORD', 'FIND')) return this.parseFindAction();
    if (this.check('KEYWORD', 'INSERT')) return this.parseInsertAction();
    // Neither matched yet — try recovery, then dispatch on whatever the
    // (possibly now-patched) token turns out to be.
    await this.expectOneOf(
      [{ type: 'KEYWORD', value: 'FIND' }, { type: 'KEYWORD', value: 'INSERT' }],
      undefined
    );
    // expectOneOf only returns without throwing if it consumed a match,
    // but we need the dispatch, not the consumed token — so re-check
    // what got consumed one position back.
    const consumed = this.tokens[this.pos - 1];
    this.pos--; // un-consume so parseFindAction/parseInsertAction can expect() it normally
    if (consumed.value === 'FIND') return this.parseFindAction();
    return this.parseInsertAction();
  }

  // <findAction> ::= "FIND" "all" "IN" IDENTIFIER <whereClause>?
  async parseFindAction() {
    const line = this.current().line;
    await this.expect('KEYWORD', 'FIND');
    await this.expect('KEYWORD', 'all', "Expected 'all' after FIND");
    await this.expect('KEYWORD', 'IN', "Expected 'IN' after 'all'");
    const table = (await this.expect('IDENTIFIER', undefined, 'Expected table name after IN')).value;
    this.symbolTable.declareTable(table, line, 'FIND');
    const where = this.check('KEYWORD', 'WHERE') ? await this.parseWhereClause(table) : null;
    return { type: 'FindAction', table, where, line };
  }

  // <insertAction> ::= "INSERT" "INTO" IDENTIFIER <whereClause>?
  async parseInsertAction() {
    const line = this.current().line;
    await this.expect('KEYWORD', 'INSERT');
    await this.expect('KEYWORD', 'INTO', "Expected 'INTO' after INSERT");
    const table = (await this.expect('IDENTIFIER', undefined, 'Expected table name after INTO')).value;
    this.symbolTable.declareTable(table, line, 'INSERT');
    const where = this.check('KEYWORD', 'WHERE') ? await this.parseWhereClause(table) : null;
    return { type: 'InsertAction', table, where, line };
  }

  // <whereClause> ::= "WHERE" IDENTIFIER EQUALS ( STRING | NUMBER )
  // `tableName` is passed in by the caller (parseFindAction /
  // parseInsertAction) so the field can be registered in the symbol
  // table under the correct table's field scope.
  async parseWhereClause(tableName) {
    const line = this.current().line;
    await this.expect('KEYWORD', 'WHERE');
    const field = (await this.expect('IDENTIFIER', undefined, 'Expected field name after WHERE')).value;
    await this.expect('EQUALS', undefined, "Expected '=' in WHERE clause");
    const literal = await this.expectOneOf(
      [{ type: 'STRING' }, { type: 'NUMBER' }],
      undefined
    );
    const value = literal.value;
    const valueType = literal.type;
    this.symbolTable.declareField(tableName, field, valueType, line);
    return { type: 'WhereClause', field, operator: '=', value, valueType, line };
  }
}

// Returns { ast, symbolTable, recoveryLog } — the symbol table is
// populated as a side effect of parsing (Week 3), and recoveryLog (Week 4)
// lists every ML/heuristic fix that was applied, in order, for the
// eventual Week 8 console panel. Now async since parsing may make API
// calls for error recovery.
async function parse(tokens, symbolTable) {
  const parser = new Parser(tokens, symbolTable);
  const ast = await parser.parseProgram();
  return { ast, symbolTable: parser.symbolTable, recoveryLog: parser.recoveryLog };
}

module.exports = { parse, Parser, ParserError };
