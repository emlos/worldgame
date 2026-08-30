# Private WG support for VS Code

This zero-build extension associates `*.wg` files with the Worldgame WG
language and provides syntax highlighting, comments, indentation, bracket
pairing, and block folding. Inline `@change` feedback, `@br` line breaks,
and escaped prose markers are highlighted as well.

Install or update it for the current Windows user from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\vscode-wg\install.ps1
```

Reload open VS Code windows after installing. Re-run the same command whenever
the extension source changes. No marketplace publication or npm installation is
needed.
