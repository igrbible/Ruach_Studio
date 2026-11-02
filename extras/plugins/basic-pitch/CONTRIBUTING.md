# Contributing

Thanks for helping. The full workflow is in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md); the short version:

1. Fork and branch from `main`.
2. Describe the change as a **scenario** in `tests/features/transcribe.feature`
   (or a unit test for a pure helper) and watch it fail.
3. Make it pass with the smallest change.
4. Before you push, all of these must be green:

   ```bash
   ruff check . && ruff format --check . && mypy && pytest
   ```

5. Update `CHANGELOG.md` under `[Unreleased]` and any docs the change touches.

## Standards

* **Strict typing.** No `Any` in `src/`, full annotations everywhere, `mypy --strict`.
* **Docstrings.** Google style, stating why and the failure modes.
* **Inject, don't import.** New behaviour that touches the outside world takes a
  protocol or callable, so tests can fake it.
* **Label assumptions.** If you rely on something Ruach Studio does not document,
  say so in `docs/PLUGIN_CONTRACT.md` and keep it in one module.

## Licence

By contributing you agree your work is released under the project's [MIT licence](LICENSE).
