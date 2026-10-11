/**
 * compiler.js
 * -----------------------------------------------------------------------
 * Wires every phase together into one function, per the plan's Week 7
 * target:
 *   compile(sourceCode) -> {tokens, ast, quadruples, optimizedQuadruples,
 *                            expressCode, sqlCode, errors, ...}
 *
 * Pipeline: lexer -> parser (+ symbol table, + ML error recovery) -> icg
 * -> optimizer -> codegen.
 *
 * Design: every phase's typed error (LexerError, ParserError,
 * SymbolTableError) is caught here and turned into an entry in
 * `result.errors` instead of throwing out of `compile()` — this is the
 * same "never crash, report a typed error" spirit rules.md requires of
 * mlRecovery.js, applied to the whole pipeline so a broken script sent
 * to the eventual /compile API endpoint gets a clean JSON error
 * response instead of a 500 with a stack trace.
 * -----------------------------------------------------------------------
 */

'use strict';

const { tokenize } = require('./lexer/lexer');
const { parse } = require('./parser/parser');
const { generateQuadruples } = require('./icg/icg');
const { buildBasicBlocks, eliminateDeadCode } = require('./optimizer/optimizer');
const { generateCode } = require('./codegen/codegen');

/**
 * @param {string} sourceCode — raw OptiScript DSL text
 * @returns {Promise<Object>} result — see shape below; every field stays
 *   `null` if the pipeline didn't get far enough to produce it.
 */
async function compile(sourceCode) {
  const result = {
    tokens: null,
    ast: null,
    symbolTable: null,
    recoveryLog: null,
    warnings: [],
    basicBlocks: null,
    quadruples: null,
    optimizedQuadruples: null,
    removedQuadruples: null,
    expressCode: null,
    sqlCode: null,
    queries: null,
    errors: [],
  };

  // ---- Phase 1: Lexical Analysis ----
  let tokens;
  try {
    tokens = tokenize(sourceCode);
    result.tokens = tokens;
  } catch (err) {
    result.errors.push({ phase: 'lexer', name: err.name, message: err.message, line: err.line });
    return result;
  }

  // ---- Phase 2/3: Syntax Analysis + Symbol Table (+ Week 4 ML recovery) ----
  let ast, symbolTable, recoveryLog;
  try {
    const parsed = await parse(tokens);
    ast = parsed.ast;
    symbolTable = parsed.symbolTable;
    recoveryLog = parsed.recoveryLog;

    result.ast = ast;
    result.symbolTable = symbolTable.toJSON ? symbolTable.toJSON() : symbolTable;
    result.recoveryLog = recoveryLog;
    result.warnings = symbolTable.warnings || [];
  } catch (err) {
    // ParserError and SymbolTableError both surface here — tell them
    // apart in the response so a UI (Week 8) can label them correctly.
    const phase = err.name === 'SymbolTableError' ? 'semantic' : 'parser';
    result.errors.push({ phase, name: err.name, message: err.message, line: err.line });
    return result;
  }

  // ---- Phase 4: Intermediate Code Generation (quadruples) ----
  const quads = generateQuadruples(ast);
  result.quadruples = quads;

  // ---- Phase 5: Optimization (basic blocks + dead-code elimination) ----
  result.basicBlocks = buildBasicBlocks(quads);
  const { optimized, removed } = eliminateDeadCode(quads);
  result.optimizedQuadruples = optimized;
  result.removedQuadruples = removed;

  // ---- Phase 6: Target Code Generation ----
  try {
    const { expressCode, sqlStatements, queries } = generateCode(optimized);
    result.expressCode = expressCode;
    result.queries = queries;
    result.sqlCode = sqlStatements.join(';\n') + (sqlStatements.length ? ';' : '');
  } catch (err) {
    result.errors.push({ phase: 'codegen', name: err.name || 'CodegenError', message: err.message });
  }

  return result;
}

module.exports = { compile };
