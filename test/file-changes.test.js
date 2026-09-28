'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { EMPTY_TREE_SHA, globToRegExp, parseRegexGroup, matchGroups, getChangedFiles, run } = require('../src/file-changes');

const README_GROUP = {
  deps: ['**', '!cypress/e2e/dynamic/**/*.ts', '!cypress/e2e/web/**/*.ts'],
  dynamic: ['cypress/e2e/dynamic/**/*.cy.ts'],
  web: ['cypress/e2e/web/**/*.cy.ts'],
};

describe('globToRegExp', () => {
  const cases = [
    ['**', 'README.md', true],
    ['**', 'a/b/c.ts', true],
    ['**', '.github/workflows/ci.yaml', true],
    ['*.ts', 'index.ts', true],
    ['*.ts', 'src/index.ts', false],
    ['src/*', 'src/a.ts', true],
    ['src/*', 'src/a/b.ts', false],
    ['src/**', 'src/a/b.ts', true],
    ['src/**', 'srcx/a.ts', false],
    ['**/*.ts', 'index.ts', true],
    ['**/*.ts', 'a/b/index.ts', true],
    ['**/*.ts', 'a/b/index.js', false],
    ['a/**/b.ts', 'a/b.ts', true],
    ['a/**/b.ts', 'a/x/y/b.ts', true],
    ['cypress/e2e/web/**/*.cy.ts', 'cypress/e2e/web/login.cy.ts', true],
    ['cypress/e2e/web/**/*.cy.ts', 'cypress/e2e/web/auth/login.cy.ts', true],
    ['cypress/e2e/web/**/*.cy.ts', 'cypress/e2e/web/support.ts', false],
    ['file?.txt', 'file1.txt', true],
    ['file?.txt', 'file12.txt', false],
    ['*.{js,ts}', 'a.ts', true],
    ['*.{js,ts}', 'a.css', false],
    ['[ab].txt', 'a.txt', true],
    ['[!ab].txt', 'a.txt', false],
    ['[!ab].txt', 'c.txt', true],
    ['a.b', 'axb', false],
    ['a+(b)', 'a+(b)', true],
  ];

  for (const [glob, file, expected] of cases) {
    test(`${glob} ${expected ? 'matches' : 'does not match'} ${file}`, () => {
      assert.equal(globToRegExp(glob).test(file), expected);
    });
  }
});

describe('parseRegexGroup', () => {
  test('parses a valid group', () => {
    assert.deepEqual(parseRegexGroup(JSON.stringify(README_GROUP)), README_GROUP);
  });

  test('rejects invalid JSON', () => {
    assert.throws(() => parseRegexGroup('{deps: [}'), /not valid JSON/);
  });

  test('rejects non-object values', () => {
    assert.throws(() => parseRegexGroup('[]'), /must be a JSON object/);
    assert.throws(() => parseRegexGroup('null'), /must be a JSON object/);
  });

  test('rejects groups that are not string arrays', () => {
    assert.throws(() => parseRegexGroup('{"a": "src/**"}'), /regex_group.a/);
    assert.throws(() => parseRegexGroup('{"a": [1]}'), /regex_group.a/);
  });
});

describe('matchGroups', () => {
  test('README example: only web tests changed', () => {
    assert.deepEqual(matchGroups(['cypress/e2e/web/login.cy.ts'], README_GROUP, 'glob'), {
      deps: false,
      dynamic: false,
      web: true,
    });
  });

  test('README example: only dynamic tests changed', () => {
    assert.deepEqual(matchGroups(['cypress/e2e/dynamic/a/b.cy.ts'], README_GROUP, 'glob'), {
      deps: false,
      dynamic: true,
      web: false,
    });
  });

  test('README example: shared dependency changed', () => {
    assert.deepEqual(matchGroups(['package.json'], README_GROUP, 'glob'), {
      deps: true,
      dynamic: false,
      web: false,
    });
  });

  test('README example: mixed changes', () => {
    assert.deepEqual(matchGroups(['cypress/e2e/web/login.cy.ts', 'src/app.ts'], README_GROUP, 'glob'), {
      deps: true,
      dynamic: false,
      web: true,
    });
  });

  test('no changed files yields all false', () => {
    assert.deepEqual(matchGroups([], README_GROUP, 'glob'), { deps: false, dynamic: false, web: false });
  });

  test('only negative patterns match everything else', () => {
    assert.deepEqual(matchGroups(['a.md'], { g: ['!*.ts'] }, 'glob'), { g: true });
    assert.deepEqual(matchGroups(['a.ts'], { g: ['!*.ts'] }, 'glob'), { g: false });
  });

  test('empty pattern list matches any change', () => {
    assert.deepEqual(matchGroups(['a.md'], { g: [] }), { g: true });
  });

  test('empty group yields empty results', () => {
    assert.deepEqual(matchGroups(['a.md'], {}), {});
  });
});

describe('matchGroups with regex patterns (default, v1 compatible)', () => {
  const CHARTS = { modified_files: ['^charts/.*/Chart.yaml$'] };

  test('anchored regex matches Chart.yaml in any chart', () => {
    assert.deepEqual(matchGroups(['charts/api/Chart.yaml'], CHARTS), { modified_files: true });
    assert.deepEqual(matchGroups(['charts/api/sub/Chart.yaml'], CHARTS), { modified_files: true });
  });

  test('anchored regex ignores other files', () => {
    assert.deepEqual(matchGroups(['charts/api/values.yaml', 'charts/Chart.yaml', 'x/charts/a/Chart.yaml'], CHARTS), {
      modified_files: false,
    });
  });

  test('default pattern type is regex', () => {
    assert.deepEqual(matchGroups(['charts/api/Chart.yaml'], CHARTS), matchGroups(['charts/api/Chart.yaml'], CHARTS, 'regex'));
  });

  test('regex is unanchored like v1', () => {
    assert.deepEqual(matchGroups(['app/src/index.ts'], { g: ['src/'] }), { g: true });
  });

  test('regex supports negative patterns', () => {
    const group = { g: ['\\.ts$', '!\\.test\\.ts$'] };
    assert.deepEqual(matchGroups(['a.test.ts'], group), { g: false });
    assert.deepEqual(matchGroups(['a.test.ts', 'a.ts'], group), { g: true });
  });

  test('invalid regex explains how to switch to glob', () => {
    assert.throws(() => matchGroups(['a.ts'], { g: ['**'] }), /Invalid regex "\*\*".*pattern_type: glob/);
  });

  test('unknown pattern type is rejected', () => {
    assert.throws(() => matchGroups(['a.ts'], { g: ['a'] }, 'wildcard'), /pattern_type must be one of: regex, glob/);
  });
});

// Matching logic from v1 (dad3d0a), used to check regex mode stays compatible.
function v1Match(changedFiles, group) {
  const results = {};
  for (const [key, patterns] of Object.entries(group)) {
    const positivePatterns = patterns.filter((p) => !p.startsWith('!'));
    const negativePatterns = patterns.filter((p) => p.startsWith('!')).map((p) => p.substring(1));
    const positiveRegex = positivePatterns.length > 0 ? new RegExp(`(${positivePatterns.join('|')})`) : null;
    const negativeRegex = negativePatterns.length > 0 ? new RegExp(`(${negativePatterns.join('|')})`) : null;
    results[key] = changedFiles.some((file) => {
      const isPositiveMatch = positiveRegex ? positiveRegex.test(file) : true;
      const isNegativeMatch = negativeRegex ? negativeRegex.test(file) : false;
      return isPositiveMatch && !isNegativeMatch;
    });
  }
  return results;
}

describe('v1 compatibility: playwright regex_group', () => {
  // Exactly as the workflow YAML delivers it: the line break in the single-quoted scalar folds into a space.
  const input =
    '{"deps":["^.*","!^playwright/tests/dynamic/.*/*.spec.ts$", ' +
    '"!^playwright/tests/web/.*/*.spec.ts$"],"dynamic":["^playwright/tests/dynamic/.*/*.spec.ts$"],"web":["^playwright/tests/web/.*/*.spec.ts$"]}';
  const group = parseRegexGroup(input);

  const scenarios = [
    [['playwright/tests/web/login.spec.ts'], { deps: false, dynamic: false, web: true }],
    [['playwright/tests/web/auth/login.spec.ts'], { deps: false, dynamic: false, web: true }],
    [['playwright/tests/dynamic/a/b.spec.ts'], { deps: false, dynamic: true, web: false }],
    [['playwright/tests/dynamic/a.spec.ts', 'playwright/tests/web/b.spec.ts'], { deps: false, dynamic: true, web: true }],
    [['package.json'], { deps: true, dynamic: false, web: false }],
    [['playwright/tests/web/helpers.ts'], { deps: true, dynamic: false, web: false }],
    [['playwright/playwright.config.ts'], { deps: true, dynamic: false, web: false }],
    [['.github/workflows/e2e.yaml'], { deps: true, dynamic: false, web: false }],
    [['src/app.ts', 'playwright/tests/web/login.spec.ts'], { deps: true, dynamic: false, web: true }],
    [[], { deps: false, dynamic: false, web: false }],
  ];

  for (const [files, expected] of scenarios) {
    test(`[${files.join(', ')}]`, () => {
      assert.deepEqual(matchGroups(files, group), expected);
      assert.deepEqual(v1Match(files, group), expected);
    });
  }
});

describe('git integration', () => {
  function git(cwd, ...args) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  }

  function commit(cwd, files, message) {
    for (const [file, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
      fs.writeFileSync(path.join(cwd, file), content);
    }
    git(cwd, 'add', '-A');
    git(cwd, '-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qm', message);
    return git(cwd, 'rev-parse', 'HEAD');
  }

  // Minimal stand-in for @actions/exec as injected by actions/github-script.
  function fakeExec(cwd) {
    return {
      async getExecOutput(cmd, args) {
        return { exitCode: 0, stdout: execFileSync(cmd, args, { cwd, encoding: 'utf8' }), stderr: '' };
      },
    };
  }

  function fakeCore() {
    const outputs = {};
    return { outputs, info() {}, setOutput: (name, value) => (outputs[name] = value) };
  }

  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'file-changes-'));
  git(repo, 'init', '-q');
  const first = commit(repo, { 'package.json': '{}', '.github/ci.yaml': 'x' }, 'first');
  const second = commit(repo, { 'cypress/e2e/web/login.cy.ts': 'x' }, 'second');

  test('getChangedFiles lists files between two commits', async () => {
    assert.deepEqual(await getChangedFiles(fakeExec(repo), first, second), ['cypress/e2e/web/login.cy.ts']);
  });

  test('getChangedFiles treats an all-zero before SHA as the empty tree', async () => {
    const zero = '0'.repeat(40);
    assert.deepEqual((await getChangedFiles(fakeExec(repo), zero, first)).sort(), ['.github/ci.yaml', 'package.json']);
    assert.equal(git(repo, 'cat-file', '-t', EMPTY_TREE_SHA), 'tree');
  });

  test('run sets the results output', async () => {
    const core = fakeCore();
    const results = await run({
      core,
      exec: fakeExec(repo),
      env: {
        INPUT_BEFORE_SHA: first,
        INPUT_CURRENT_SHA: second,
        INPUT_REGEX_GROUP: JSON.stringify(README_GROUP),
        INPUT_PATTERN_TYPE: 'glob',
      },
    });
    assert.deepEqual(results, { deps: false, dynamic: false, web: true });
    assert.equal(core.outputs.results, JSON.stringify(results));
  });

  test('run defaults to regex patterns', async () => {
    const core = fakeCore();
    await run({
      core,
      exec: fakeExec(repo),
      env: {
        INPUT_BEFORE_SHA: first,
        INPUT_CURRENT_SHA: second,
        INPUT_REGEX_GROUP: '{"web": ["^cypress/e2e/web/.*\\\\.cy\\\\.ts$"], "charts": ["^charts/.*/Chart.yaml$"]}',
      },
    });
    assert.equal(core.outputs.results, '{"web":true,"charts":false}');
  });

  test('run accepts regex_group containing single quotes', async () => {
    const core = fakeCore();
    await run({
      core,
      exec: fakeExec(repo),
      env: { INPUT_BEFORE_SHA: first, INPUT_CURRENT_SHA: second, INPUT_REGEX_GROUP: `{"it's": [".*"]}` },
    });
    assert.equal(core.outputs.results, `{"it's":true}`);
  });

  test.after(() => fs.rmSync(repo, { recursive: true, force: true }));
});
