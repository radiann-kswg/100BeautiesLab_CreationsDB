# Test Guide

This repository now includes a minimal test setup using Vitest.

## Prerequisites

- Node.js >= 18

## Install

```powershell
npm install
```

## Run tests

```powershell
# 通常
npm test

# PowerShell の実行ポリシーにより npm.ps1 がブロックされる環境では npm.cmd を使います
npm.cmd test
# or watch mode
npm run test:watch
npm.cmd run test:watch
```

補足：

- `cmd /c npm test` や `.\\node_modules\\.bin\\vitest.cmd run` でも実行できます。

## What is covered

- Sanity check for all JSON files under `data/`.
- Presence checks for key meta/type definitions used by the Service Worker enrichers.

## Notes

- We do not import `api/sw.js` directly because it targets a browser Service Worker runtime.
- If you want to add logic-level tests for enrichment, prefer importing pure logic from `lib/data-common.js` (and avoid depending on a Service Worker runtime).
