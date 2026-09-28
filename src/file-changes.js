'use strict';

// Converts a glob pattern into an anchored RegExp.
// Supports `**`, `*`, `?`, `{a,b}` and `[...]`. Dotfiles are matched like any other file.
function globToRegExp(glob) {
  let re = '';
  let inGroup = 0;

  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];

    if (c === '*') {
      if (glob[i + 1] === '*') {
        const atSegmentStart = i === 0 || glob[i - 1] === '/';
        i++;
        if (atSegmentStart && glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '[') {
      const end = glob.indexOf(']', i + 1);
      if (end === -1) {
        re += '\\[';
      } else {
        let cls = glob.slice(i + 1, end).replace(/\\/g, '\\\\');
        if (cls.startsWith('!')) cls = '^' + cls.slice(1);
        re += `[${cls}]`;
        i = end;
      }
    } else if (c === '{') {
      inGroup++;
      re += '(?:';
    } else if (c === '}' && inGroup > 0) {
      inGroup--;
      re += ')';
    } else if (c === ',' && inGroup > 0) {
      re += '|';
    } else {
      re += c.replace(/[.+^$()|\\{}\]]/g, '\\$&');
    }
  }

  return new RegExp(`^${re}$`);
}

function parseRegexGroup(regexGroup) {
  let parsed;
  try {
    parsed = JSON.parse(regexGroup);
  } catch (error) {
    throw new Error(`regex_group is not valid JSON: ${error.message}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('regex_group must be a JSON object of arrays');
  }

  for (const [key, patterns] of Object.entries(parsed)) {
    if (!Array.isArray(patterns) || !patterns.every((p) => typeof p === 'string')) {
      throw new Error(`regex_group.${key} must be an array of strings`);
    }
  }

  return parsed;
}

const PATTERN_TYPES = {
  // Unanchored, like v1: `src/` matches any path containing `src/`.
  regex: (pattern) => {
    try {
      return new RegExp(pattern);
    } catch (error) {
      throw new Error(`Invalid regex "${pattern}" (set pattern_type: glob to use glob patterns): ${error.message}`);
    }
  },
  glob: globToRegExp,
};

function getCompiler(patternType = 'regex') {
  const compile = PATTERN_TYPES[patternType];
  if (!compile) {
    throw new Error(`pattern_type must be one of: ${Object.keys(PATTERN_TYPES).join(', ')}`);
  }
  return compile;
}

// Returns `{ [key]: boolean }`, true when at least one file matches a positive
// pattern of the group and no negative (`!`-prefixed) pattern.
function matchGroups(changedFiles, group, patternType = 'regex') {
  const compile = getCompiler(patternType);
  const results = {};

  for (const [key, patterns] of Object.entries(group)) {
    const positive = patterns.filter((p) => !p.startsWith('!')).map(compile);
    const negative = patterns.filter((p) => p.startsWith('!')).map((p) => compile(p.slice(1)));

    results[key] = changedFiles.some((file) => {
      const isPositiveMatch = positive.length > 0 ? positive.some((re) => re.test(file)) : true;
      const isNegativeMatch = negative.some((re) => re.test(file));
      return isPositiveMatch && !isNegativeMatch;
    });
  }

  return results;
}

// `git hash-object -t tree /dev/null`, used when there is no previous commit (e.g. first push).
const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

async function getChangedFiles(exec, before, current) {
  if (!before || /^0+$/.test(before)) before = EMPTY_TREE_SHA;
  const { stdout } = await exec.getExecOutput('git', ['diff', '--name-only', before, current], { silent: true });
  return stdout.split('\n').map((f) => f.trim()).filter(Boolean);
}

async function run({ core, exec, env = process.env }) {
  const before = env.INPUT_BEFORE_SHA;
  const current = env.INPUT_CURRENT_SHA;
  const group = parseRegexGroup(env.INPUT_REGEX_GROUP);
  const patternType = env.INPUT_PATTERN_TYPE || 'regex';
  getCompiler(patternType);

  core.info(`Comparing ${before}...${current}`);
  const changedFiles = await getChangedFiles(exec, before, current);
  core.info(`Changed files:\n${changedFiles.join('\n')}`);

  const results = matchGroups(changedFiles, group, patternType);
  core.info(`Results: ${JSON.stringify(results)}`);
  core.setOutput('results', JSON.stringify(results));
  return results;
}

module.exports = { EMPTY_TREE_SHA, globToRegExp, parseRegexGroup, matchGroups, getChangedFiles, run };
