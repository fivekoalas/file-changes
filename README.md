# File Changes

A GitHub Action to match changed files with a regex group.

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
      - uses: actions/checkout@v4

      - uses: fivekoalas/file-changes@v1
        with:
          before_sha: ${{ github.event.before }}
          current_sha: ${{ github.sha }}
          regex_group:  '{"deps": ["**", "!cypress/e2e/dynamic/**/*.ts", "!cypress/e2e/web/**/*.ts"], "dynamic": ["cypress/e2e/dynamic/**/*.cy.ts"], "web": ["cypress/e2e/web/**/*.cy.ts"]}'
```

## License Summary

This code is made available under the MIT license.
