# OptiScript Playground (Week 8)

React split-screen playground for the OptiScript compiler, per `design.md`.

## Running locally

You need the backend (Week 7) running first:

```bash
# from the repo root
npm start          # starts server.js on :4000
```

Then, in a second terminal:

```bash
cd frontend
npm install
npm run dev         # starts Vite on :5173
```

Open http://localhost:5173. The dev server proxies `/compile` and
`/health` to the backend on :4000 (see `vite.config.js`), so no CORS
setup is needed.

## Layout (per design.md)

- **Top bar** — title + a plain "Compile" button.
- **Split pane** — DSL input (left, line-numbered) / generated
  Express.js + MySQL code (right, tabbed).
- **Console** (bottom, collapsible) — a phase-by-phase log (Lexing,
  Parsing, ICG, Optimization, Codegen), with ML/heuristic error-recovery
  fixes and hard errors both shown in the muted red accent color,
  sparingly, per the design system.

## Structure

```
src/
  api.js                    - fetch wrapper around POST /compile
  App.jsx / App.css         - top bar + split pane layout
  components/
    CodeEditor.jsx/.css     - line-numbered DSL input
    OutputPane.jsx/.css     - tabbed read-only Express/SQL output
    ConsolePanel.jsx/.css   - collapsible phase log
  index.css                - design.md's color/typography tokens as CSS vars
```
