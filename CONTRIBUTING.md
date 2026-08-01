# Contributing

Thanks for helping make ServerLab MC better.

## Setup

```powershell
npm install
npm run dev
```

Use `npm run dev:stop` if local dev ports are still occupied from a previous run.

## Branches

Use short branch names that describe the work:

```text
feature/software-cache
fix/socket-auth
docs/readme-cleanup
```

## Validation

Run the relevant checks before opening a PR:

```powershell
npm run lint
npm test
npm run build
```

For release work, run:

```powershell
npm run release:check
```

## Pull Requests

Keep PRs focused and explain:

- what changed
- why it changed
- how it was tested
- any remaining risk or follow-up work

Do not commit local app data, generated runtimes, software cache artifacts, packaged installers, or build output.

