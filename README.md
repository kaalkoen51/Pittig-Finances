# Pittig Finances

A very simple finance app for a small product business: log sales, see what each
client still owes, log expenses, see costs and profit per product batch, keep
track of bills to pay, and import/export Excel.

- **Windows desktop app** (Electron, one-click installer) – the main product.
- **Phone**: the same app as a responsive web app / PWA (data is per device).
- Dutch and English UI. No VAT. Manual categorisation only.

## Develop

```bash
npm ci
npm run dev            # browser, http://localhost:5173
npm run electron:dev   # desktop window
npm test               # unit tests
npm run e2e            # Playwright end-to-end tests
npm run typecheck
npm run dist:win       # Windows installer (run on Windows, or use the GitHub Action)
```

## Docs

- [docs/HANDOVER.md](docs/HANDOVER.md) – install, backups, updates, cheat sheet for the user
- [docs/PLAN.md](docs/PLAN.md) – design and decisions
- [docs/CONTRACTS.md](docs/CONTRACTS.md) – code structure and internal APIs
