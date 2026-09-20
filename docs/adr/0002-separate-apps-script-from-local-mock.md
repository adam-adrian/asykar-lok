# Separate Google Apps Script from Local Mock Server

Google Apps Script (`Code.gs`) and local dev mock server (`server.js`) remain separate, standalone adapters at the network seam without shared build-time compilation.

## Context
An architecture review suggested unifying CRUD action handlers between `Code.gs` and `server.js` to adhere to DRY. However, Google Apps Script executes in a specialized Google Cloud runtime (`SpreadsheetApp`, `DriveApp`, `ScriptCache`) without native npm ESM support, whereas `server.js` is a lightweight Node.js/Bun local dev mock for offline development.

## Decision
We decided against unifying `Code.gs` and `server.js` into a shared module. Each environment maintains its own adapter implementation tailored to its runtime constraints, avoiding the introduction of heavy build tools (clasp, bundlers, transpilation) for what is fundamentally a simple Vanilla JS + Apps Script architecture.

## Consequences
- Backend action modifications must be updated in `Code.gs` (and mirrored in `server.js` if offline dev mock fidelity is needed).
- No build step or bundler is required for deploying to Google Apps Script.
- The repository retains its zero-build simplicity.
