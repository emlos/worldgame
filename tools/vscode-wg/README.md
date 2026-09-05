# Private WG support for VS Code

This zero-build extension associates `*.wg` files with the Worldgame WG
language and provides syntax highlighting, comments, indentation, bracket
pairing, and block folding.

The TextMate grammar and language configuration are generated from
`src/story/wg/shared/language.js`. Regenerate them with
`node tools/wg/compile.mjs`; `node tools/wg/compile.mjs --check` verifies that
the compiler, editor support, and directive index are synchronized.

Install or update it for the current Windows user from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\vscode-wg\install.ps1
```

Reload open VS Code windows after installing. Re-run the same command whenever
the extension source changes. No marketplace publication or npm installation is
needed.
