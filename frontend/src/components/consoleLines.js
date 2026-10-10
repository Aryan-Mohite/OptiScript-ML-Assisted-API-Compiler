// Helpers that turn a compile() result into console text.
// Kept out of the .jsx files so components stay hot-reload friendly.

export function statusLabel(status, result) {
  if (status === 'idle') return '';
  if (status === 'compiling') return 'Compiling…';
  if (status === 'network-error') return 'Backend unreachable';
  if (result && result.errors && result.errors.length > 0) return 'Failed';
  return 'Success';
}

export function buildPhaseLines(result, status) {
  if (status === 'network-error') {
    return [{ kind: 'error', text: `Could not reach the compiler API — is the backend running (npm start)?` }];
  }
  if (!result) return [];

  const lines = [];

  // --- Lexing ---
  if (result.tokens) {
    lines.push({ kind: 'info', text: `[Lexing] ${result.tokens.length} token(s) generated.` });
  }

  // --- Errors from lexer/parser/semantic phases short-circuit here,
  //     since compile() stops the pipeline at the first phase that fails ---
  const hardError = result.errors?.find((e) => e.phase === 'lexer' || e.phase === 'parser' || e.phase === 'semantic');
  if (hardError) {
    lines.push({ kind: 'error', text: `[${capitalize(hardError.phase)}] ${hardError.name}: ${hardError.message}` });
    return lines;
  }

  // --- Parsing + Symbol Table ---
  if (result.ast) {
    const routeCount = result.symbolTable?.routes?.length ?? 0;
    const tableCount = result.symbolTable?.tables?.length ?? 0;
    lines.push({ kind: 'info', text: `[Parsing] AST built — ${routeCount} route(s), ${tableCount} table(s) registered.` });
  }

  // --- ML / heuristic recovery, shown distinctly per design.md ---
  if (result.recoveryLog && result.recoveryLog.length > 0) {
    result.recoveryLog.forEach((r) => {
      const via = r.source === 'ml' ? 'ML' : 'heuristic fallback';
      lines.push({
        kind: 'ml-recovery',
        text: `[ML Recovery] Fixed via ${via}: expected ${r.expected}, corrected to "${r.value}" (line ${r.line}).`,
      });
    });
  }

  // --- Symbol table warnings, if any ---
  if (result.warnings && result.warnings.length > 0) {
    result.warnings.forEach((w) => lines.push({ kind: 'warning', text: `[Semantic] ${w}` }));
  }

  // --- ICG + Optimization ---
  if (result.quadruples) {
    lines.push({ kind: 'info', text: `[ICG] ${result.quadruples.length} quadruple(s) generated.` });
  }
  if (result.optimizedQuadruples) {
    const removedCount = result.removedQuadruples?.length ?? 0;
    lines.push({
      kind: 'info',
      text: `[Optimization] ${result.optimizedQuadruples.length} quadruple(s) kept, ${removedCount} removed as dead code.`,
    });
  }

  // --- Codegen ---
  const codegenError = result.errors?.find((e) => e.phase === 'codegen');
  if (codegenError) {
    lines.push({ kind: 'error', text: `[Codegen] ${codegenError.name}: ${codegenError.message}` });
  } else if (result.expressCode) {
    const routeMatches = result.expressCode.match(/^app\.(get|post)/gm) || [];
    lines.push({ kind: 'info', text: `[Codegen] ${routeMatches.length} Express route(s) + SQL generated.` });
    lines.push({ kind: 'success', text: `Compilation succeeded.` });
  }

  return lines;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
