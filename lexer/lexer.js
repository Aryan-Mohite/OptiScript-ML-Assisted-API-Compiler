/**
 * lexer.js
 * -----------------------------------------------------------------------
 * OptiScript Lexer (Module 1 — Lexical Analysis)
 *
 * Hand-coded, character-by-character scanner (no regex-based tokenizing
 * shortcuts) as required by rules.md. Converts raw OptiScript source text
 * into an array of tokens: { type, value, line }.
 *
 * Usage:
 *   const { tokenize } = require('./lexer');
 *   const tokens = tokenize('GET /books -> FIND all IN library_db');
 * -----------------------------------------------------------------------
 */

// Reserved keywords — matched exactly (case-sensitive), see docs/grammar.md
const KEYWORDS = new Set([
  'GET', 'POST', 'FIND', 'all', 'IN', 'WHERE', 'INSERT', 'INTO'
]);

// Single-character symbols that map directly to a token type
const SYMBOLS = {
  '/': 'SLASH',
  '(': 'LPAREN',
  ')': 'RPAREN',
  '=': 'EQUALS',
};

class LexerError extends Error {
  constructor(message, line, column) {
    super(`LexerError (line ${line}, col ${column}): ${message}`);
    this.name = 'LexerError';
    this.line = line;
    this.column = column;
  }
}

class Lexer {
  constructor(source) {
    this.source = source;
    this.pos = 0;        // current index into source
    this.line = 1;        // current line number (for error messages)
    this.column = 1;      // current column number (for error messages)
    this.tokens = [];
  }

  // ---- low-level character helpers ----

  peek(offset = 0) {
    return this.source[this.pos + offset];
  }

  isAtEnd() {
    return this.pos >= this.source.length;
  }

  advance() {
    const ch = this.source[this.pos];
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  addToken(type, value) {
    this.tokens.push({ type, value, line: this.line });
  }

  // ---- character classification ----

  isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }

  isAlpha(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  isAlphaNumeric(ch) {
    return this.isAlpha(ch) || this.isDigit(ch);
  }

  // ---- main scan loop ----

  tokenize() {
    while (!this.isAtEnd()) {
      this.scanToken();
    }
    this.addToken('EOF', null);
    return this.tokens;
  }

  scanToken() {
    const ch = this.peek();

    // Whitespace (spaces, tabs, newlines) — skip
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      this.advance();
      return;
    }

    // Comments: '#' to end of line — skip entirely
    if (ch === '#') {
      while (!this.isAtEnd() && this.peek() !== '\n') {
        this.advance();
      }
      return;
    }

    // Arrow: '->'
    if (ch === '-' && this.peek(1) === '>') {
      this.advance(); // consume '-'
      this.advance(); // consume '>'
      this.addToken('ARROW', '->');
      return;
    }

    // Single-character symbols
    if (SYMBOLS[ch]) {
      this.advance();
      this.addToken(SYMBOLS[ch], ch);
      return;
    }

    // String literal: "..."
    if (ch === '"') {
      this.scanString();
      return;
    }

    // Number literal: digits only (v1 — no decimals)
    if (this.isDigit(ch)) {
      this.scanNumber();
      return;
    }

    // Identifier or keyword
    if (this.isAlpha(ch)) {
      this.scanIdentifier();
      return;
    }

    // Anything else is an unrecognized character
    throw new LexerError(`Unexpected character '${ch}'`, this.line, this.column);
  }

  scanString() {
    const startLine = this.line;
    this.advance(); // consume opening quote
    let value = '';
    while (!this.isAtEnd() && this.peek() !== '"') {
      if (this.peek() === '\n') {
        throw new LexerError('Unterminated string literal (hit newline)', startLine, this.column);
      }
      value += this.advance();
    }
    if (this.isAtEnd()) {
      throw new LexerError('Unterminated string literal (hit EOF)', startLine, this.column);
    }
    this.advance(); // consume closing quote
    this.addToken('STRING', value);
  }

  scanNumber() {
    let value = '';
    while (!this.isAtEnd() && this.isDigit(this.peek())) {
      value += this.advance();
    }
    this.addToken('NUMBER', value);
  }

  scanIdentifier() {
    let value = '';
    while (!this.isAtEnd() && this.isAlphaNumeric(this.peek())) {
      value += this.advance();
    }
    if (KEYWORDS.has(value)) {
      this.addToken('KEYWORD', value);
    } else {
      this.addToken('IDENTIFIER', value);
    }
  }
}

function tokenize(source) {
  const lexer = new Lexer(source);
  return lexer.tokenize();
}

module.exports = { tokenize, Lexer, LexerError, KEYWORDS, SYMBOLS };
