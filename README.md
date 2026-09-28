# File Changes

A GitHub Action to match changed files against groups of regex or glob patterns.

## Usage

Add the following step to your workflow:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # both SHAs must be available for `git diff`

      - uses: fivekoalas/file-changes@v1
        with:
          before_sha: ${{ github.event.before }}
          current_sha: ${{ github.sha }}
          pattern_type: glob
          regex_group:  '{"deps": ["**", "!cypress/e2e/dynamic/**/*.ts", "!cypress/e2e/web/**/*.ts"], "dynamic": ["cypress/e2e/dynamic/**/*.cy.ts"], "web": ["cypress/e2e/web/**/*.cy.ts"]}'
```

Read the result with `fromJSON(steps.<id>.outputs.results).<key>`, e.g. `{"deps":false,"dynamic":false,"web":true}`.

### Patterns

`pattern_type` selects how patterns are read. It defaults to `regex`, so existing v1 workflows keep working.

**`regex`** (default): unanchored JavaScript regular expressions, so use `^`/`$` to match the whole path:

```yaml
          regex_group: '{"modified_files": ["^charts/.*/Chart.yaml$"]}'
```

**`glob`**: matched against the full path of each changed file:

- `*` matches within a path segment, `**` matches across segments (dotfiles included), `?` matches one character
- `{a,b}` and `[abc]` / `[!abc]` are supported
- A pattern prefixed with `!` excludes matching files from the group

A group is `true` when at least one changed file matches a positive pattern and no negative pattern.

## Development

```bash
npm test
```

## License Summary

This code is made available under the MIT license.
