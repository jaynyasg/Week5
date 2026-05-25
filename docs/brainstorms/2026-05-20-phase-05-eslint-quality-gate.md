---
title: "Phase 05 - ESLint Quality Gate"
date: 2026-05-20
status: completed
origin: docs/brainstorms/2026-05-19-shipshape-additional-improvements.md Item A
depends_on: Phase 04 timeline/dependency planning
---

# Phase 05 - ESLint Quality Gate

## Goal

Add an executable ESLint baseline for the monorepo so future type-safety, React hooks, and JSX accessibility regressions are visible in one standard command.

## Scope

- Add ESLint flat config at the repo root.
- Add workspace `lint` scripts for `api`, `web`, and `shared`.
- Enable:
  - `@eslint/js` recommended rules
  - `typescript-eslint` recommended rules
  - `eslint-plugin-react-hooks` recommended rules for web code
  - `eslint-plugin-jsx-a11y` recommended rules for web code
- Capture a JSON and Markdown baseline artifact.

## Out Of Scope

- Fixing existing lint violations.
- Adding the lint gate to CI before the baseline is intentionally burned down.
- Reformatting unrelated source files.

## Evidence

- Baseline JSON: `eval/results/eslint-phase05-baseline.json`
- Baseline summary: `eval/results/eslint-phase05-summary.md`
- Smoke command: `pnpm lint`
- Current maintained-source baseline: 333 files checked, 116 files with findings, 487 errors, 29 warnings.

## Follow-Up

Recommended cleanup order:

1. API test `@typescript-eslint/no-explicit-any` findings.
2. Unused variables in API routes/services.
3. React hooks findings in web pages and components.
4. JSX accessibility findings from `jsx-a11y`.
