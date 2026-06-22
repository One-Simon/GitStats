import assert from "node:assert/strict";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { promisify } from "node:util";
import {
  buildCardPlans,
  commitGeneratedFiles,
  GitHubClient,
  GitStatsApiError,
  main,
  normalizeToken,
  optionsFromEnv,
  parseReadmeConfigEntries,
  renderPlannedCards,
} from "../src/generate-languages.mjs";

const execFileAsync = promisify(execFile);

function jsonResponse(body, { status = 200, statusText = "OK", headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Headers(headers),
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function sampleReadme(configs) {
  return `${configs}

<!-- gitstats:display -->
<!-- gitstats:display -->
`;
}

function basicEnv(overrides = {}) {
  return {
    GITSTATS_TOKEN: " token ",
    GITSTATS_USERNAME: "One-Simon",
    GITSTATS_COMMIT: "false",
    GITSTATS_README_CONFIG: "README.md",
    ...overrides,
  };
}

async function git(cwd, args) {
  return execFileAsync("git", args, { cwd, encoding: "utf8" });
}

async function createTempGitRepo(name) {
  const root = join(tmpdir(), `${name}-${Date.now()}`);
  const remote = join(root, "remote.git");
  const local = join(root, "local");
  await mkdir(root, { recursive: true });
  await mkdir(local, { recursive: true });
  await git(root, ["init", "--bare", "remote.git"]);
  await git(local, ["init"]);
  await git(local, ["config", "user.name", "Test User"]);
  await git(local, ["config", "user.email", "test@example.com"]);
  await writeFile(join(local, "README.md"), "initial\n", "utf8");
  await git(local, ["add", "README.md"]);
  await git(local, ["commit", "-m", "Initial commit"]);
  await git(local, ["branch", "-M", "main"]);
  const remoteUrl = pathToFileURL(remote).href;
  await git(local, ["remote", "add", "origin", remoteUrl]);
  await git(local, ["push", "-u", "origin", "main"]);
  await git(root, ["--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main"]);
  return { root, remote, remoteUrl, local };
}

test("normalizes and rejects blank tokens", async () => {
  assert.equal(normalizeToken("  abc  "), "abc");
  assert.throws(
    () => new GitHubClient({ token: "   " }),
    /non-empty token/,
  );
});

test("classifies GitHub auth and primary rate-limit failures", async () => {
  const authClient = new GitHubClient({
    token: "bad",
    fetchImpl: async () => jsonResponse(
      { message: "Bad credentials", status: "401" },
      { status: 401, statusText: "Unauthorized" },
    ),
  });

  await assert.rejects(
    () => authClient.request("/user", { operation: "token-preflight" }, { retry: false }),
    (error) => error instanceof GitStatsApiError
      && error.classification === "auth"
      && /invalid, expired, or revoked/.test(error.message),
  );

  const rateClient = new GitHubClient({
    token: "rate",
    fetchImpl: async () => jsonResponse(
      { message: "API rate limit exceeded for user ID 1.", status: "403" },
      {
        status: 403,
        statusText: "Forbidden",
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1900000000",
        },
      },
    ),
  });

  await assert.rejects(
    () => rateClient.request("/user/repos", { operation: "list-repos" }, { retry: false }),
    (error) => error instanceof GitStatsApiError
      && error.classification === "rate-limit"
      && /remaining=0/.test(error.message),
  );
});

test("classifies other GitHub failure modes and preserves useful headers", async () => {
  const cases = [
    {
      status: 403,
      statusText: "Forbidden",
      body: { message: "Resource not accessible by personal access token" },
      headers: { "x-accepted-github-permissions": "contents=read" },
      classification: "permission",
      match: /accepted-permissions=contents=read/,
    },
    {
      status: 429,
      statusText: "Too Many Requests",
      body: { message: "You have exceeded a secondary rate limit." },
      headers: { "retry-after": "2", "x-ratelimit-remaining": "42" },
      classification: "secondary-rate-limit",
      retryAfter: 2,
    },
    {
      status: 404,
      statusText: "Not Found",
      body: { message: "Not Found" },
      classification: "not-found",
    },
    {
      status: 409,
      statusText: "Conflict",
      body: { message: "Git Repository is empty." },
      classification: "empty-repo",
    },
    {
      status: 422,
      statusText: "Unprocessable Entity",
      body: { message: "Validation Failed" },
      classification: "validation",
    },
    {
      status: 503,
      statusText: "Service Unavailable",
      body: { message: "Service unavailable" },
      classification: "server",
    },
  ];

  for (const failure of cases) {
    const client = new GitHubClient({
      token: "x",
      fetchImpl: async () => jsonResponse(
        failure.body,
        { status: failure.status, statusText: failure.statusText, headers: failure.headers },
      ),
    });

    await assert.rejects(
      () => client.request("/test", { operation: "classification-test" }, { retry: false }),
      (error) => {
        assert.equal(error instanceof GitStatsApiError, true);
        assert.equal(error.classification, failure.classification);
        if (failure.retryAfter !== undefined) assert.equal(error.rateLimit.retryAfter, failure.retryAfter);
        if (failure.match) assert.match(error.message, failure.match);
        return true;
      },
    );
  }

  const networkClient = new GitHubClient({
    token: "x",
    fetchImpl: async () => {
      throw new Error("socket hang up");
    },
  });

  await assert.rejects(
    () => networkClient.request("/test", { operation: "network-test" }, { retry: false }),
    (error) => error instanceof GitStatsApiError
      && error.classification === "network"
      && /socket hang up/.test(error.message),
  );
});

test("retries short transient GitHub failures within the retry budget", async () => {
  let calls = 0;
  const client = new GitHubClient({
    token: "x",
    apiMaxRetrySeconds: 1,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse(
          { message: "Service unavailable" },
          { status: 503, statusText: "Service Unavailable", headers: { "retry-after": "0.001" } },
        );
      }
      return jsonResponse({ ok: true });
    },
  });

  const result = await client.request("/user", { operation: "retry-test" });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
});

test("reuses repository and all-time language calls across matching cards", async () => {
  const readme = sampleReadme(`<!-- gitstats:config first
timeframe: all-time
style: normal
gitstats:config -->

<!-- gitstats:config second
timeframe: all-time
style: compact
gitstats:config -->`);
  const options = optionsFromEnv(basicEnv());
  const plans = buildCardPlans(options, parseReadmeConfigEntries(readme));
  const requests = [];
  const client = new GitHubClient({
    ...options,
    fetchImpl: async (url) => {
      requests.push(String(url));
      if (String(url).endsWith("/user")) return jsonResponse({ login: "One-Simon" });
      if (String(url).endsWith("/rate_limit")) {
        return jsonResponse({ resources: { core: { limit: 5000, remaining: 4000, used: 1000, reset: 1900000000 } } });
      }
      if (String(url).includes("/user/repos")) {
        return jsonResponse([{ name: "repo-a", owner: { login: "One-Simon" }, fork: false, archived: false }]);
      }
      if (String(url).includes("/languages")) return jsonResponse({ JavaScript: 100 });
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  const cards = await renderPlannedCards(plans, { client });
  assert.equal(cards.length, 2);
  assert.equal(requests.filter((url) => url.includes("/user/repos")).length, 1);
  assert.equal(requests.filter((url) => url.includes("/languages")).length, 1);
});

test("reuses recent timeframe totals across matching cards", async () => {
  const readme = sampleReadme(`<!-- gitstats:config first
timeframe: 8
style: normal
gitstats:config -->

<!-- gitstats:config second
timeframe: 8
style: compact
gitstats:config -->`);
  const options = optionsFromEnv(basicEnv());
  const plans = buildCardPlans(options, parseReadmeConfigEntries(readme));
  const requests = [];
  const client = new GitHubClient({
    ...options,
    fetchImpl: async (url) => {
      const path = String(url);
      requests.push(path);
      if (path.includes("/user/repos")) {
        return jsonResponse([{ name: "repo-a", owner: { login: "One-Simon" }, fork: false, archived: false }]);
      }
      if (path.includes("/commits?")) {
        return jsonResponse(
          [{ sha: "abc" }],
          { headers: { "x-ratelimit-remaining": "1000", "x-ratelimit-reset": "1900000000" } },
        );
      }
      if (path.includes("/commits/abc")) {
        return jsonResponse({ files: [{ filename: "src/app.ts", changes: 12 }] });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  const cards = await renderPlannedCards(plans, { client });
  assert.equal(cards.length, 2);
  assert.equal(requests.filter((url) => url.includes("/user/repos")).length, 1);
  assert.equal(requests.filter((url) => url.includes("/commits?")).length, 2);
  assert.equal(requests.filter((url) => url.includes("/commits/abc")).length, 1);
});

test("fails before writing files when a later card cannot authenticate", async () => {
  const previousFetch = globalThis.fetch;
  const previousCwd = process.cwd();
  const dir = await mkdir(join(tmpdir(), `gitstats-auth-fail-${Date.now()}`), { recursive: true });
  process.chdir(dir);
  await writeFile("README.md", sampleReadme(`<!-- gitstats:config one
timeframe: all-time
style: normal
gitstats:config -->

<!-- gitstats:config two
timeframe: 8
style: compact
gitstats:config -->`), "utf8");

  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.endsWith("/user")) return jsonResponse({ login: "One-Simon" });
    if (path.endsWith("/rate_limit")) {
      return jsonResponse({ resources: { core: { limit: 5000, remaining: 4000, used: 1000, reset: 1900000000 } } });
    }
    if (path.includes("/user/repos")) {
      return jsonResponse([{ name: "repo-a", owner: { login: "One-Simon" }, fork: false, archived: false }]);
    }
    if (path.includes("/languages")) return jsonResponse({ JavaScript: 100 });
    if (path.includes("/commits?")) {
      return jsonResponse({ message: "Bad credentials", status: "401" }, { status: 401, statusText: "Unauthorized" });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    await assert.rejects(
      () => main(basicEnv()),
      /could not authenticate/,
    );
    await assert.rejects(() => stat("profile/one.svg"), /ENOENT/);
    const readme = await readFile("README.md", "utf8");
    assert.equal(readme.includes("<img"), false);
  } finally {
    globalThis.fetch = previousFetch;
    process.chdir(previousCwd);
    await rm(dir, { recursive: true, force: true });
  }
});

test("fails recent cards before commit-detail work when API budget is too low", async () => {
  const readme = sampleReadme(`<!-- gitstats:config recent
timeframe: 8
style: compact
gitstats:config -->`);
  const options = optionsFromEnv(basicEnv());
  const plans = buildCardPlans(options, parseReadmeConfigEntries(readme));
  const requests = [];
  const client = new GitHubClient({
    ...options,
    fetchImpl: async (url) => {
      requests.push(String(url));
      if (String(url).includes("/user/repos")) {
        return jsonResponse(
          [{ name: "repo-a", owner: { login: "One-Simon" }, fork: false, archived: false }],
          { headers: { "x-ratelimit-remaining": "100", "x-ratelimit-reset": "1900000000" } },
        );
      }
      if (String(url).includes("/commits?")) {
        return jsonResponse(
          [{ sha: "abc" }],
          { headers: { "x-ratelimit-remaining": "10", "x-ratelimit-reset": "1900000000" } },
        );
      }
      if (String(url).includes("/commits/abc")) {
        throw new Error("commit detail should not be requested when budget is too low");
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  await assert.rejects(
    () => renderPlannedCards(plans, { client }),
    (error) => error instanceof GitStatsApiError
      && error.classification === "rate-limit"
      && /needs about 1 more GitHub API requests/.test(error.message),
  );
  assert.equal(requests.some((url) => url.includes("/commits/abc")), false);
});

test("writes both cards and README display after all cards render", async () => {
  const previousFetch = globalThis.fetch;
  const previousCwd = process.cwd();
  const dir = await mkdir(join(tmpdir(), `gitstats-success-${Date.now()}`), { recursive: true });
  process.chdir(dir);
  await writeFile("README.md", sampleReadme(`<!-- gitstats:config one
timeframe: all-time
style: normal
gitstats:config -->

<!-- gitstats:config two
timeframe: 8
style: compact
gitstats:config -->`), "utf8");

  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.endsWith("/user")) return jsonResponse({ login: "One-Simon" });
    if (path.endsWith("/rate_limit")) {
      return jsonResponse({ resources: { core: { limit: 5000, remaining: 4000, used: 1000, reset: 1900000000 } } });
    }
    if (path.includes("/user/repos")) {
      return jsonResponse([{ name: "repo-a", owner: { login: "One-Simon" }, fork: false, archived: false }]);
    }
    if (path.includes("/languages")) return jsonResponse({ JavaScript: 100 });
    if (path.includes("/commits?")) return jsonResponse([{ sha: "abc" }]);
    if (path.includes("/commits/abc")) {
      return jsonResponse({ files: [{ filename: "src/app.ts", changes: 12 }] });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    await main(basicEnv());
    assert.ok(await stat("profile/one.svg"));
    assert.ok(await stat("profile/two.svg"));
    const readme = await readFile("README.md", "utf8");
    assert.match(readme, /profile\/one\.svg/);
    assert.match(readme, /profile\/two\.svg/);
  } finally {
    globalThis.fetch = previousFetch;
    process.chdir(previousCwd);
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects unsafe names, fractional timeframes, and single display markers", async () => {
  assert.throws(
    () => buildCardPlans(optionsFromEnv(basicEnv()), parseReadmeConfigEntries(`<!-- gitstats:config ../bad
timeframe: all-time
gitstats:config -->`)),
    /Invalid GitStats config block name/,
  );

  assert.throws(
    () => buildCardPlans(optionsFromEnv(basicEnv()), parseReadmeConfigEntries(`<!-- gitstats:config badtime
timeframe: 1.5
gitstats:config -->`)),
    /positive integer number of weeks/,
  );

  const previousFetch = globalThis.fetch;
  const previousCwd = process.cwd();
  const dir = await mkdir(join(tmpdir(), `gitstats-single-marker-${Date.now()}`), { recursive: true });
  process.chdir(dir);
  await writeFile("README.md", `<!-- gitstats:config one
timeframe: all-time
gitstats:config -->

<!-- gitstats:display -->
`, "utf8");

  try {
    await assert.rejects(
      () => main(basicEnv()),
      /needs a closing display marker/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    process.chdir(previousCwd);
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects missing and mismatched display markers before API calls", async () => {
  const previousFetch = globalThis.fetch;
  const previousCwd = process.cwd();
  const dir = await mkdir(join(tmpdir(), `gitstats-display-errors-${Date.now()}`), { recursive: true });
  let fetchCalls = 0;
  process.chdir(dir);
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("GitHub should not be called before display markers validate");
  };

  try {
    await writeFile("README.md", `<!-- gitstats:config one
timeframe: all-time
gitstats:config -->
`, "utf8");
    await assert.rejects(
      () => main(basicEnv()),
      /display block was not found/,
    );

    await writeFile("README.md", `<!-- gitstats:config one
timeframe: all-time
gitstats:config -->

<!-- gitstats:display missing -->
<!-- gitstats:display missing -->
`, "utf8");
    await assert.rejects(
      () => main(basicEnv()),
      /does not match any named gitstats config block/,
    );

    await writeFile("README.md", `<!-- gitstats:config one
timeframe: all-time
gitstats:config -->

<!-- gitstats:display one -->
<!-- gitstats:display two -->
`, "utf8");
    await assert.rejects(
      () => main(basicEnv()),
      /display block markers must match/,
    );

    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = previousFetch;
    process.chdir(previousCwd);
    await rm(dir, { recursive: true, force: true });
  }
});

test("generated git commits include skip-ci marker", async () => {
  const previousCwd = process.cwd();
  const { root, local } = await createTempGitRepo("gitstats-commit-message");

  try {
    process.chdir(local);
    await mkdir("profile", { recursive: true });
    await writeFile("profile/card.svg", "<svg />\n", "utf8");
    await commitGeneratedFiles(["profile/card.svg"], true);

    const { stdout } = await git(local, ["log", "-1", "--pretty=%B"]);
    assert.match(stdout, /Update language stats \[skip ci\]/);
  } finally {
    process.chdir(previousCwd);
    await rm(root, { recursive: true, force: true });
  }
});

test("generated git commits fail clearly when remote branch moved", async () => {
  const previousCwd = process.cwd();
  const { root, remote, local } = await createTempGitRepo("gitstats-remote-moved");
  const updater = join(root, "updater");

  try {
    await git(root, ["clone", remote, updater]);
    await git(updater, ["config", "user.name", "Updater"]);
    await git(updater, ["config", "user.email", "updater@example.com"]);
    await writeFile(join(updater, "README.md"), "remote changed\n", "utf8");
    await git(updater, ["add", "README.md"]);
    await git(updater, ["commit", "-m", "Remote change"]);
    await git(updater, ["push", "origin", "main"]);

    process.chdir(local);
    await mkdir("profile", { recursive: true });
    await writeFile("profile/card.svg", "<svg />\n", "utf8");

    await assert.rejects(
      () => commitGeneratedFiles(["profile/card.svg"], true),
      /Remote branch origin\/main moved while GitStats was running/,
    );
  } finally {
    process.chdir(previousCwd);
    await rm(root, { recursive: true, force: true });
  }
});
