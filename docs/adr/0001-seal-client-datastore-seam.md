# Seal Client DataStore Seam

All client data access must pass through `DataStore` query and command methods; global property bridges (`window.data*`) and duplicated storage helpers are eliminated, and getters return shallow copy guards.

## Context
Previously, `js/app.js` maintained legacy getter/setter property bridges on `window` (`window.dataKlasemen`, etc.) that directly mutated `store.state`, bypassing the outbox queue, optimistic commit lifecycle, and disk persistence. Direct reference returns also allowed callers to accidentally mutate internal state via in-place operations like `.sort()`.

## Decision
We removed all `window.data*` proxy bridges and duplicated storage functions (`loadData`, `saveData`) in `js/app.js`. `DataStore` getters (`getKlasemen`, `getMatches`, `getEvents`, `getGedung`, `getSakan`) now return shallow copy arrays (`[...this.state.*]`), protecting internal store invariants while keeping caller mutations isolated.

## Consequences
- Callers must explicitly use `store.get*()` and `store.save*()`.
- Internal cache arrays cannot be corrupted by caller-side array mutations.
- Legacy storage keys in `app.js` are eliminated, concentrating all disk persistence rules in `js/data-store.js`.
