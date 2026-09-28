'use strict';

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

// Patterns are unanchored JavaScript regexes: `src/` matches any path containing `src/`.
function compileRegex(pattern) {
  try {
    return new RegExp(pattern);
  } catch (error) {
    throw new Error(`Invalid regex "${pattern}": ${error.message}`);
  }
}

// Returns `{ [key]: boolean }`, true when at least one file matches a positive
// pattern of the group and no negative (`!`-prefixed) pattern.
function matchGroups(changedFiles, group) {
  const results = {};

  for (const [key, patterns] of Object.entries(group)) {
    const positive = patterns.filter((p) => !p.startsWith('!')).map(compileRegex);
    const negative = patterns.filter((p) => p.startsWith('!')).map((p) => compileRegex(p.slice(1)));

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
  // Fail on invalid patterns before running git.
  matchGroups([], group);

  core.info(`Comparing ${before}...${current}`);
  const changedFiles = await getChangedFiles(exec, before, current);
  core.info(`Changed files:\n${changedFiles.join('\n')}`);

  const results = matchGroups(changedFiles, group);
  core.info(`Results: ${JSON.stringify(results)}`);
  core.setOutput('results', JSON.stringify(results));
  return results;
}

module.exports = { EMPTY_TREE_SHA, compileRegex, parseRegexGroup, matchGroups, getChangedFiles, run };
