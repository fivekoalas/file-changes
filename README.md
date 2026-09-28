# File Changes

A GitHub Action to match changed files against groups of regexes.

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
          regex_group: '{"deps": ["^.*", "!^cypress/e2e/dynamic/.*\\.ts$", "!^cypress/e2e/web/.*\\.ts$"], "dynamic": ["^cypress/e2e/dynamic/.*\\.cy\\.ts$"], "web": ["^cypress/e2e/web/.*\\.cy\\.ts$"]}'
```

Read the result with `fromJSON(steps.<id>.outputs.results).<key>`, e.g. `{"deps":false,"dynamic":false,"web":true}`.

### Patterns

Each pattern is an unanchored JavaScript regular expression tested against the full path of each changed file:

- Use `^` and `$` to match the whole path, e.g. `^charts/.*/Chart.yaml$`
- Escape a literal `.` as `\\.` inside the JSON string
- A pattern prefixed with `!` excludes matching files from the group

A group is `true` when at least one changed file matches a positive pattern and no negative pattern.

## Development

```bash
npm test
```

## License Summary

This code is made available under the MIT license.
