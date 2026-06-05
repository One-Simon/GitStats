import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const README_CONFIG_START = "<!-- gitstats:config";
const README_CONFIG_END = "gitstats:config -->";
const README_DISPLAY_MARKER = "<!-- gitstats:display -->";
const ALL_TIME = "all-time";
const METRIC_BYTES = "bytes";
const METRIC_CHANGES = "changes";
const OTHER_LANGUAGE = "Other";
const GROUPING_TARGET_MIN = 0.045;
const GROUPING_TARGET_MAX = 0.055;
const GENERATED_OUTPUT_DIR = "profile";
const GENERATED_COMMIT_MESSAGE = "Update language stats";
const GIT_AUTHOR_NAME = "github-actions[bot]";
const GIT_AUTHOR_EMAIL = "41898282+github-actions[bot]@users.noreply.github.com";
const execFileAsync = promisify(execFile);

export function parseBoolean(value) {
  return String(value || "false").toLowerCase() === "true";
}

function parseStrictBoolean(value) {
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return value;
}

async function github(path, headers) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  return response.json();
}

async function listRepos({ affiliation, visibility, username, includeForks, includeArchived, includeProfileRepo, headers }) {
  const repos = [];
  for (let page = 1; ; page += 1) {
    const batch = await github(
      `/user/repos?per_page=100&page=${page}&affiliation=${encodeURIComponent(affiliation)}&visibility=${encodeURIComponent(visibility)}&sort=updated`,
      headers,
    );
    repos.push(...batch);
    if (batch.length < 100) break;
  }

  return repos.filter((repo) => {
    if (repo.owner?.login?.toLowerCase() !== username.toLowerCase()) return false;
    if (!includeForks && repo.fork) return false;
    if (!includeArchived && repo.archived) return false;
    if (!includeProfileRepo && repo.name.toLowerCase() === username.toLowerCase()) return false;
    return true;
  });
}

export function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseReadmeConfigValue(key, value) {
  if (key === "max-languages") return Number(value);
  if (key === "timeframe") return parseTimeframe(value);
  if (key === "grouping") return parseStrictBoolean(value);
  if (["include-forks", "include-archived", "include-profile-repo", "show-values"].includes(key)) {
    return parseBoolean(value);
  }
  if (key === "hide-languages") return parseCsv(value);
  if (key === "style") return value.toLowerCase();
  return value;
}

export function parseReadmeConfig(markdown) {
  const configs = parseReadmeConfigEntries(markdown);
  return configs.find(({ name }) => !name)?.config || configs[0]?.config || {};
}

export function parseReadmeConfigs(markdown) {
  const entries = parseReadmeConfigEntries(markdown);
  const configs = new Map();

  for (const entry of entries) {
    configs.set(entry.key, entry.config);
  }

  return configs;
}

export function parseReadmeConfigEntries(markdown) {
  markdown = withoutFencedCodeBlocks(markdown);
  const configs = [];
  let searchStart = 0;

  while (true) {
    const start = findNextConfigStart(markdown, searchStart);
    if (start === -1) return configs;

    const headerEnd = markdown.indexOf("\n", start);
    const end = markdown.indexOf(README_CONFIG_END, start);
    if (end === -1) {
      throw new Error("README GitStats config block is missing its closing marker.");
    }

    const header = markdown.slice(start + README_CONFIG_START.length, headerEnd === -1 ? end : headerEnd).trim();
    const name = header.replace(/-->$/, "").trim().toLowerCase();
    const bodyStart = headerEnd === -1 || headerEnd > end ? start + README_CONFIG_START.length : headerEnd + 1;
    const originalName = header.replace(/-->$/, "").trim();
    configs.push({
      name: originalName,
      key: name,
      config: parseReadmeConfigBody(markdown.slice(bodyStart, end)),
    });
    searchStart = end + README_CONFIG_END.length;
  }
}

function findNextConfigStart(markdown, searchStart) {
  let start = markdown.indexOf(README_CONFIG_START, searchStart);

  while (start !== -1) {
    const lineStart = markdown.lastIndexOf("\n", start - 1) + 1;
    if (!markdown.slice(lineStart, start).trim()) return start;
    start = markdown.indexOf(README_CONFIG_START, start + README_CONFIG_START.length);
  }

  return -1;
}

function findDisplayMarkers(markdown) {
  const markers = [];
  let inFence = false;
  let fenceChar = "";
  let offset = 0;
  const lines = markdown.match(/[^\r\n]*(?:\r\n|\n|$)/g) || [];

  for (const rawLine of lines) {
    if (!rawLine) continue;

    const line = rawLine.replace(/\r?\n$/, "");
    const trimmedStart = line.trimStart();
    const fence = trimmedStart.match(/^(```+|~~~+)/)?.[1];

    if (fence && (!inFence || fence[0] === fenceChar)) {
      inFence = !inFence;
      fenceChar = inFence ? fence[0] : "";
    } else if (!inFence && line.trim() === README_DISPLAY_MARKER) {
      markers.push({ start: offset, end: offset + rawLine.length });
    }

    offset += rawLine.length;
  }

  return markers;
}

function withoutFencedCodeBlocks(markdown) {
  let inFence = false;
  let fenceChar = "";

  return markdown.split(/\r?\n/).map((line) => {
    const trimmed = line.trimStart();
    const fence = trimmed.match(/^(```+|~~~+)/)?.[1];

    if (fence && (!inFence || fence[0] === fenceChar)) {
      inFence = !inFence;
      fenceChar = inFence ? fence[0] : "";
      return "";
    }

    return inFence ? "" : line;
  }).join("\n");
}

function parseReadmeConfigBody(body) {
  const config = {};

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf(":");
    if (separator === -1) {
      throw new Error(`Invalid README GitStats config line: ${line}`);
    }

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    config[key] = parseReadmeConfigValue(key, value);
  }

  return config;
}

export function colorFor(language) {
  const colors = {
    JavaScript: "#f1e05a",
    TypeScript: "#3178c6",
    Python: "#3572A5",
    Java: "#b07219",
    Kotlin: "#A97BFF",
    Swift: "#F05138",
    C: "#555555",
    "C++": "#f34b7d",
    "C#": "#178600",
    Go: "#00ADD8",
    Rust: "#dea584",
    PHP: "#4F5D95",
    Ruby: "#701516",
    Shell: "#89e051",
    PowerShell: "#012456",
    Vue: "#41b883",
    Svelte: "#ff3e00",
    Dart: "#00B4AB",
    Dockerfile: "#384d54",
    HTML: "#e34c26",
    CSS: "#563d7c",
    SCSS: "#c6538c",
    Jupyter: "#DA5B0B",
    R: "#198CE7",
    [OTHER_LANGUAGE]: "#8b949e",
  };

  if (colors[language]) return colors[language];
  let hash = 0;
  for (const char of language) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 62% 48%)`;
}

export function renderSvg(languages, total, options = {}) {
  const renderOptions = normalizeRenderOptions(options);
  if (renderOptions.style === "compact") return renderCompactSvg(languages, total, renderOptions);
  return renderNormalSvg(languages, total, renderOptions);
}

function normalizeRenderOptions(options) {
  const timeframe = options.timeframe ?? ALL_TIME;
  const metric = options.metric || metricForTimeframe(timeframe);

  return {
    ...options,
    timeframe,
    metric,
    showValues: options.showValues !== false,
    title: options.title || defaultTitle(timeframe),
    subtitle: defaultSubtitle(timeframe),
  };
}

function renderNormalSvg(languages, total, options) {
  const valueFormatter = options.valueFormatter || ((pct, value) => formatListValue(pct, value, options));
  const width = 520;
  const paddingX = 18;
  const contentWidth = width - paddingX * 2;
  const rowHeight = 28;
  const height = 78 + languages.length * rowHeight;
  const barY = 54;
  const barWidth = contentWidth;
  let offset = 0;

  const barSegments = languages.map(({ language, value }) => {
    const segmentWidth = Math.max(0, (value / total) * barWidth);
    const x = offset;
    offset += segmentWidth;
    return `<rect x="${(paddingX + x).toFixed(2)}" y="${barY}" width="${segmentWidth.toFixed(2)}" height="10" fill="${colorFor(language)}" />`;
  }).join("\n    ");

  const rows = languages.map(({ language, value }, index) => {
    const y = 92 + index * rowHeight;
    const pct = ((value / total) * 100).toFixed(1);
    const formattedValue = valueFormatter(pct, value);
    return `<g transform="translate(${paddingX} ${y})">
      <circle cx="5" cy="-4" r="5" fill="${colorFor(language)}" />
      <text x="18" y="0" class="name">${escapeXml(language)}</text>
      <text x="${contentWidth}" y="0" text-anchor="end" class="value">${formattedValue}</text>
    </g>`;
  }).join("\n    ");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(options.title)}</title>
  <desc id="desc">${escapeXml(svgDescription(options.metric))}</desc>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .card-bg { fill: #f6f8fa; stroke: #d0d7de; }
    .title { fill: #24292f; font-size: 18px; font-weight: 600; }
    .meta { fill: #57606a; font-size: 12px; font-weight: 600; }
    .name { fill: #24292f; font-size: 13px; font-weight: 600; }
    .value { fill: #57606a; font-size: 12px; }
    @media (prefers-color-scheme: dark) {
      .card-bg { fill: #161b22; stroke: #30363d; }
      .title, .name { fill: #c9d1d9; }
      .meta, .value { fill: #8b949e; }
    }
  </style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" class="card-bg" />
  <text x="${paddingX}" y="30" class="title">${escapeXml(options.title)}</text>
  <text x="${width - paddingX}" y="30" text-anchor="end" class="meta">${escapeXml(options.subtitle)}</text>
  <clipPath id="bar"><rect x="${paddingX}" y="54" width="${contentWidth}" height="10" rx="5" /></clipPath>
  <g clip-path="url(#bar)">
    <rect x="${paddingX}" y="54" width="${contentWidth}" height="10" fill="#d0d7de" />
    ${barSegments}
  </g>
  ${rows}
</svg>
`;
}

function renderCompactSvg(languages, total, options) {
  const width = 520;
  const paddingX = 18;
  const contentWidth = width - paddingX * 2;
  const height = 132;
  const barY = 54;
  const barHeight = 22;
  const labelY = 98;
  const otherLabelWidth = 42;
  const otherGap = 4;
  const compactLanguages = groupCompactLanguages(languages, total, contentWidth, otherLabelWidth + otherGap);
  const other = compactLanguages.find(({ language }) => language === OTHER_LANGUAGE);
  const barWidth = other ? contentWidth - otherLabelWidth - otherGap : contentWidth;
  let offset = 0;

  const barSegments = compactLanguages.map(({ language, value }, index) => {
    const segmentWidth = Math.max(0, (value / total) * barWidth);
    const x = paddingX + offset;
    offset += segmentWidth;
    return `<path d="${roundedRectPath(x, barY, segmentWidth, barHeight, index === 0 ? 11 : 0, index === compactLanguages.length - 1 ? 11 : 0)}" fill="${colorFor(language)}" />`;
  }).join("\n    ");

  offset = 0;
  const labels = compactLanguages.filter(({ language }) => language !== OTHER_LANGUAGE).map(({ language, value }) => {
    const segmentWidth = Math.max(0, (value / total) * barWidth);
    const x = paddingX + offset + segmentWidth / 2;
    offset += segmentWidth;
    const pct = ((value / total) * 100).toFixed(1);

    return `<g transform="translate(${x.toFixed(2)} ${labelY})">
      <text x="0" y="0" text-anchor="middle" class="name">${escapeXml(language)}</text>
      <text x="0" y="18" text-anchor="middle" class="value">${pct}%</text>
    </g>`;
  }).join("\n    ");

  const otherLabel = other ? `<g transform="translate(${width - paddingX} ${barY + 3})">
    <text x="0" y="0" text-anchor="end" class="other-name">Other</text>
    <text x="0" y="18" text-anchor="end" class="other-value">${((other.value / total) * 100).toFixed(1)}%</text>
  </g>` : "";

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(options.title)}</title>
  <desc id="desc">${escapeXml(svgDescription(options.metric))}</desc>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .card-bg { fill: #f6f8fa; stroke: #d0d7de; }
    .title { fill: #24292f; font-size: 18px; font-weight: 600; }
    .meta { fill: #57606a; font-size: 12px; font-weight: 600; }
    .name { fill: #111827; font-size: 12px; font-weight: 800; }
    .value { fill: #1f2937; font-size: 11px; font-weight: 800; }
    .other-name { fill: #111827; font-size: 11px; font-weight: 800; }
    .other-value { fill: #1f2937; font-size: 10px; font-weight: 800; }
    @media (prefers-color-scheme: dark) {
      .card-bg { fill: #161b22; stroke: #30363d; }
      .title, .name, .other-name { fill: #f0f6fc; }
      .meta, .value, .other-value { fill: #c9d1d9; }
    }
  </style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" class="card-bg" />
  <text x="${paddingX}" y="30" class="title">${escapeXml(options.title)}</text>
  <text x="${width - paddingX}" y="30" text-anchor="end" class="meta">${escapeXml(options.subtitle)}</text>
  <g>
    ${barSegments}
  </g>
  ${otherLabel}
  ${labels}
</svg>
`;
}

function roundedRectPath(x, y, width, height, leftRadius, rightRadius) {
  const safeWidth = Math.max(0, width);
  const left = Math.min(leftRadius, safeWidth / 2, height / 2);
  const right = Math.min(rightRadius, safeWidth / 2, height / 2);
  const x2 = x + safeWidth;
  const y2 = y + height;

  return [
    `M ${x + left} ${y}`,
    `H ${x2 - right}`,
    right ? `Q ${x2} ${y} ${x2} ${y + right}` : `L ${x2} ${y}`,
    `V ${y2 - right}`,
    right ? `Q ${x2} ${y2} ${x2 - right} ${y2}` : `L ${x2} ${y2}`,
    `H ${x + left}`,
    left ? `Q ${x} ${y2} ${x} ${y2 - left}` : `L ${x} ${y2}`,
    `V ${y + left}`,
    left ? `Q ${x} ${y} ${x + left} ${y}` : `L ${x} ${y}`,
    "Z",
  ].join(" ");
}

function groupCompactLanguages(languages, total, width, otherReservedWidth) {
  const minReadableRatio = 0.55;

  for (let visibleCount = languages.length; visibleCount >= 1; visibleCount -= 1) {
    const visible = languages.slice(0, visibleCount);
    const grouped = languages.slice(visibleCount);
    const labelWidth = grouped.length ? width - otherReservedWidth : width;
    const candidate = grouped.length
      ? mergeOtherBucket([...visible, ...grouped.map((item) => ({ ...item, language: OTHER_LANGUAGE }))])
      : visible;

    if (visible.every(({ language, value }) => {
      const pct = (value / total) * 100;
      const segmentWidth = (value / total) * labelWidth;
      return segmentWidth >= compactLabelWidth(language, pct) * minReadableRatio;
    })) {
      return candidate;
    }
  }

  return [{ language: OTHER_LANGUAGE, value: total }];
}

function compactLabelWidth(label, pct) {
  const pctText = `${pct.toFixed(1)}%`;
  return Math.max(label.length * 6.8, pctText.length * 5.8) + 16;
}

export function isAllTime(timeframe) {
  return timeframe === ALL_TIME;
}

function defaultTitle(timeframe) {
  return isAllTime(timeframe) ? "Most Used Languages" : "Recent Languages";
}

function defaultSubtitle(timeframe) {
  return isAllTime(timeframe) ? "all-time" : `last ${timeframe} weeks`;
}

function svgDescription(metric) {
  if (metric === METRIC_BYTES) {
    return "Language usage by GitHub language byte counts across repositories available to the token.";
  }
  return "Recent language activity by GitHub commit file change counts across repositories available to the token.";
}

function formatListValue(pct, value, options) {
  if (!options.showValues) return `${pct}%`;
  return `${pct}% &#183; ${formatMetricValue(value, options.metric)}`;
}

export function formatMetricValue(value, metric) {
  if (metric === METRIC_BYTES) return formatBytes(value);
  return formatChanges(value);
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes).toLocaleString("en-US")} B`;
}

function formatChanges(changes) {
  return `${Math.round(changes).toLocaleString("en-US")} changes`;
}

export function parseTimeframe(value) {
  if (String(value || "").toLowerCase() === ALL_TIME) return ALL_TIME;
  return Number(value);
}

export function metricForTimeframe(timeframe) {
  return isAllTime(timeframe) ? METRIC_BYTES : METRIC_CHANGES;
}

function sinceForTimeframe(timeframe) {
  return new Date(Date.now() - timeframe * 7 * 24 * 60 * 60 * 1000).toISOString();
}

function languageForFilename(filename) {
  const basename = filename.split("/").pop() || filename;
  const lower = basename.toLowerCase();
  const fullNameMatches = {
    dockerfile: "Dockerfile",
    makefile: "Makefile",
  };
  if (fullNameMatches[lower]) return fullNameMatches[lower];

  const extension = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
  const extensions = {
    ".c": "C",
    ".cc": "C++",
    ".cpp": "C++",
    ".cs": "C#",
    ".css": "CSS",
    ".dart": "Dart",
    ".go": "Go",
    ".html": "HTML",
    ".java": "Java",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".json": "JSON",
    ".kt": "Kotlin",
    ".kts": "Kotlin",
    ".mjs": "JavaScript",
    ".php": "PHP",
    ".ps1": "PowerShell",
    ".py": "Python",
    ".r": "R",
    ".rb": "Ruby",
    ".rs": "Rust",
    ".scss": "SCSS",
    ".sh": "Shell",
    ".svelte": "Svelte",
    ".swift": "Swift",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".vue": "Vue",
  };

  return extensions[extension] || null;
}

export function filterAndRankTotals(totals, options) {
  const hide = new Set(options.hideLanguages.map((language) => language.toLowerCase()));
  const filtered = [...totals.entries()]
    .filter(([, value]) => value > 0)
    .filter(([language]) => !hide.has(language.toLowerCase()))
    .map(([language, value]) => ({ language, value }));

  return groupAndRankLanguages(filtered, options);
}

export function groupAndRankLanguages(languages, options) {
  const normalized = mergeOtherBucket(languages.filter(({ value }) => value > 0));
  const total = normalized.reduce((sum, item) => sum + item.value, 0);
  const afterPercentGrouping = options.grouping === false
    ? normalized
    : applyPercentGrouping(normalized, total);
  return applyMaxLanguageGrouping(afterPercentGrouping, options.maxLanguages);
}

function compareLanguageEntries(a, b) {
  if (b.value !== a.value) return b.value - a.value;
  if (a.language === OTHER_LANGUAGE && b.language !== OTHER_LANGUAGE) return 1;
  if (b.language === OTHER_LANGUAGE && a.language !== OTHER_LANGUAGE) return -1;
  return a.language.localeCompare(b.language);
}

function mergeOtherBucket(languages) {
  let otherValue = 0;
  const named = [];

  for (const item of languages) {
    if (item.language === OTHER_LANGUAGE) {
      otherValue += item.value;
    } else {
      named.push(item);
    }
  }

  named.sort(compareLanguageEntries);
  if (otherValue > 0) named.push({ language: OTHER_LANGUAGE, value: otherValue });
  return named;
}

function applyPercentGrouping(languages, total) {
  if (!total) return languages;

  const named = languages.filter(({ language }) => language !== OTHER_LANGUAGE);
  const otherValue = languages
    .filter(({ language }) => language === OTHER_LANGUAGE)
    .reduce((sum, item) => sum + item.value, 0);
  const ascending = [...named].sort((a, b) => a.value - b.value || a.language.localeCompare(b.language));
  const grouped = [];
  let groupedValue = 0;

  for (const item of ascending) {
    const nextValue = groupedValue + item.value;
    const nextRatio = nextValue / total;
    if (nextRatio > GROUPING_TARGET_MAX) break;
    grouped.push(item);
    groupedValue = nextValue;
    if (nextRatio >= GROUPING_TARGET_MIN) break;
  }

  if (!grouped.length) return languages;

  const groupedLanguages = new Set(grouped.map(({ language }) => language));
  return mergeOtherBucket([
    ...named.filter(({ language }) => !groupedLanguages.has(language)),
    { language: OTHER_LANGUAGE, value: otherValue + groupedValue },
  ]);
}

function applyMaxLanguageGrouping(languages, maxLanguages) {
  if (languages.length <= maxLanguages) return mergeOtherBucket(languages);
  if (maxLanguages === 1) {
    return [{ language: OTHER_LANGUAGE, value: languages.reduce((sum, item) => sum + item.value, 0) }];
  }

  const named = languages.filter(({ language }) => language !== OTHER_LANGUAGE);
  const otherValue = languages
    .filter(({ language }) => language === OTHER_LANGUAGE)
    .reduce((sum, item) => sum + item.value, 0);
  const keep = named.slice(0, maxLanguages - 1);
  const grouped = named.slice(maxLanguages - 1);
  const groupedValue = grouped.reduce((sum, item) => sum + item.value, otherValue);

  return mergeOtherBucket([...keep, { language: OTHER_LANGUAGE, value: groupedValue }]);
}

async function collectLanguageByteTotals(headers, repos) {
  const totals = new Map();

  for (const repo of repos) {
    const languages = await github(`/repos/${repo.owner.login}/${repo.name}/languages`, headers);
    for (const [language, bytes] of Object.entries(languages)) {
      totals.set(language, (totals.get(language) || 0) + bytes);
    }
  }

  return totals;
}

async function collectLanguageChangeTotals(options, headers, repos) {
  const totals = new Map();
  const since = sinceForTimeframe(options.timeframe);

  for (const repo of repos) {
    for (let page = 1; ; page += 1) {
      let commits;
      try {
        commits = await github(
          `/repos/${repo.owner.login}/${repo.name}/commits?per_page=100&page=${page}&since=${encodeURIComponent(since)}`,
          headers,
        );
      } catch (error) {
        if (String(error.message).startsWith("409 Conflict:")) break;
        throw error;
      }
      if (!commits.length) break;

      for (const commit of commits) {
        const detail = await github(`/repos/${repo.owner.login}/${repo.name}/commits/${commit.sha}`, headers);
        for (const file of detail.files || []) {
          const language = languageForFilename(file.filename);
          if (!language) continue;
          totals.set(language, (totals.get(language) || 0) + (file.changes ?? file.additions ?? 0));
        }
      }

      if (commits.length < 100) break;
    }
  }

  return totals;
}

async function collectLanguageTotals(options, headers, repos) {
  if (metricForTimeframe(options.timeframe) === METRIC_BYTES) {
    return collectLanguageByteTotals(headers, repos);
  }
  return collectLanguageChangeTotals(options, headers, repos);
}

export async function generateLanguagesFromGithub(options) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${options.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": options.userAgent,
  };
  const repos = await listRepos({ ...options, headers });
  const metric = metricForTimeframe(options.timeframe);
  const totals = await collectLanguageTotals(options, headers, repos);
  const languages = filterAndRankTotals(totals, options);
  const total = languages.reduce((sum, language) => sum + language.value, 0);

  if (!total) {
    throw new Error("No language data found. Check token access, timeframe, repository activity, and hidden language filters.");
  }

  return { languages, metric, repos, total };
}

export function optionsFromEnv(env = process.env) {
  const maxLanguages = Number(env.GITSTATS_MAX_LANGUAGES || 10);
  const timeframe = parseTimeframe(env.GITSTATS_TIMEFRAME || ALL_TIME);
  const readmeConfigPath = Object.hasOwn(env, "GITSTATS_README_CONFIG") ? env.GITSTATS_README_CONFIG : "README.md";

  return {
    token: env.GITSTATS_TOKEN,
    username: env.GITSTATS_USERNAME,
    maxLanguages,
    timeframe,
    hideLanguages: parseCsv(env.GITSTATS_HIDE_LANGUAGES || "HTML,CSS,JSON"),
    includeForks: parseBoolean(env.GITSTATS_INCLUDE_FORKS),
    includeArchived: parseBoolean(env.GITSTATS_INCLUDE_ARCHIVED),
    includeProfileRepo: parseBoolean(env.GITSTATS_INCLUDE_PROFILE_REPO),
    grouping: Object.hasOwn(env, "GITSTATS_GROUPING") ? parseStrictBoolean(env.GITSTATS_GROUPING) : true,
    commit: Object.hasOwn(env, "GITSTATS_COMMIT") ? parseStrictBoolean(env.GITSTATS_COMMIT) : true,
    showValues: parseBoolean(env.GITSTATS_SHOW_VALUES || "true"),
    affiliation: env.GITSTATS_AFFILIATION || "owner",
    visibility: env.GITSTATS_VISIBILITY || "all",
    title: env.GITSTATS_TITLE || "",
    style: (env.GITSTATS_STYLE || "normal").toLowerCase(),
    userAgent: env.GITSTATS_USER_AGENT || "GitStats-language-card",
    readmeConfigPath,
  };
}

function mergeConfig(options, readmeConfig) {
  return {
    ...options,
    title: readmeConfig.title ?? options.title,
    style: readmeConfig.style ?? options.style,
    maxLanguages: readmeConfig["max-languages"] ?? options.maxLanguages,
    timeframe: readmeConfig.timeframe ?? options.timeframe,
    hideLanguages: readmeConfig["hide-languages"] ?? options.hideLanguages,
    includeForks: readmeConfig["include-forks"] ?? options.includeForks,
    includeArchived: readmeConfig["include-archived"] ?? options.includeArchived,
    includeProfileRepo: readmeConfig["include-profile-repo"] ?? options.includeProfileRepo,
    grouping: readmeConfig.grouping ?? options.grouping,
    showValues: readmeConfig["show-values"] ?? options.showValues,
    "display-width": readmeConfig["display-width"] ?? options["display-width"],
    "display-alt": readmeConfig["display-alt"] ?? options["display-alt"],
    affiliation: readmeConfig.affiliation ?? options.affiliation,
    visibility: readmeConfig.visibility ?? options.visibility,
  };
}

export async function loadReadmeConfig(path) {
  if (!path) return {};

  try {
    return parseReadmeConfig(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export async function loadReadmeConfigEntries(path) {
  if (!path) return [];

  try {
    return parseReadmeConfigEntries(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function loadNamedReadmeConfig(path, name) {
  if (!path) return {};
  if (!name) return loadReadmeConfig(path);

  try {
    const configs = parseReadmeConfigs(await readFile(path, "utf8"));
    const key = name.toLowerCase();
    if (!configs.has(key)) {
      throw new Error(`README GitStats config block "${name}" was not found.`);
    }
    return configs.get(key);
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export function validateOptions(options) {
  if (!options.token) throw new Error("GitStats requires a token input.");
  if (!options.username) throw new Error("GitStats requires a username input.");
  if (!Number.isFinite(options.maxLanguages) || options.maxLanguages < 1) {
    throw new Error("max-languages must be a positive number.");
  }
  if (!isAllTime(options.timeframe) && (!Number.isFinite(options.timeframe) || options.timeframe < 1)) {
    throw new Error("timeframe must be all-time or a positive number of weeks.");
  }
  if (!["normal", "compact"].includes(options.style)) {
    throw new Error("style must be normal or compact.");
  }
  if (typeof options.showValues !== "boolean") {
    throw new Error("show-values must be true or false.");
  }
  if (typeof options.grouping !== "boolean") {
    throw new Error("grouping must be true or false.");
  }
  if (typeof options.commit !== "boolean") {
    throw new Error("commit must be true or false.");
  }

  if (!Array.isArray(options.hideLanguages)) {
    throw new Error("hide-languages must be a comma-separated language list.");
  }
}

function assertSafeOutputName(name) {
  if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw new Error(`Invalid GitStats config block name "${name}". Use a filename-safe block name without slashes.`);
  }
}

function outputNameFromConfig(entry, options) {
  if (entry.name) {
    assertSafeOutputName(entry.name);
    return entry.name;
  }

  const kind = isAllTime(options.timeframe) ? "MostUsed" : `Recent${options.timeframe}Weeks`;
  return `GitStats-${kind}-${options.style}`;
}

function outputPathForConfig(entry, options, usedOutputPaths) {
  const baseName = outputNameFromConfig(entry, options);
  const basePath = `${GENERATED_OUTPUT_DIR}/${baseName}`;
  const svgPath = basePath.toLowerCase().endsWith(".svg") ? basePath : `${basePath}.svg`;
  let candidate = svgPath;
  let index = 2;

  while (usedOutputPaths.has(candidate)) {
    candidate = svgPath.replace(/\.svg$/i, `-${index}.svg`);
    index += 1;
  }

  usedOutputPaths.add(candidate);
  return candidate;
}

function eolFor(markdown) {
  return markdown.includes("\r\n") ? "\r\n" : "\n";
}

function renderDisplayHtml(cards) {
  const imageHtml = cards.map(({ output, options }) => {
    const width = options["display-width"] || "100%";
    const alt = options["display-alt"] || options.title || defaultTitle(options.timeframe);
    return `  <img width="${escapeXml(width)}" src="./${escapeXml(output)}" alt="${escapeXml(alt)}" />`;
  });

  return [
    '<div align="center">',
    imageHtml.join("\n  <br />\n  <br />\n"),
    "</div>",
  ].join("\n");
}

function readmeDisplayMarkers(markdown) {
  const markers = findDisplayMarkers(markdown);

  if (!markers.length) {
    throw new Error(`README GitStats display block was not found. Add two ${README_DISPLAY_MARKER} markers where the generated cards should appear.`);
  }
  if (markers.length === 1) {
    throw new Error(`README GitStats display block needs a closing ${README_DISPLAY_MARKER} marker.`);
  }
  if (markers.length > 2) {
    throw new Error(`README GitStats display block is ambiguous. Use exactly two ${README_DISPLAY_MARKER} markers.`);
  }

  return markers;
}

function replaceReadmeDisplay(markdown, cards) {
  const markers = readmeDisplayMarkers(markdown);

  const eol = eolFor(markdown);
  const displayHtml = renderDisplayHtml(cards).replaceAll("\n", eol);
  return `${markdown.slice(0, markers[0].end)}${displayHtml}${eol}${markdown.slice(markers[1].start)}`;
}

async function updateReadmeDisplay(path, markdown, cards) {
  const updated = replaceReadmeDisplay(markdown, cards);
  if (updated === markdown) return null;
  await writeFile(path, updated, "utf8");
  return path;
}

async function writeGeneratedFilesOutput(paths, env) {
  if (!env.GITHUB_OUTPUT) return;
  await appendFile(env.GITHUB_OUTPUT, `generated-files<<EOF\n${paths.join("\n")}\nEOF\n`, "utf8");
}

async function git(args, options = {}) {
  try {
    return await execFileAsync("git", args, { encoding: "utf8", ...options });
  } catch (error) {
    const stderr = error.stderr ? `\n${error.stderr}` : "";
    const stdout = error.stdout ? `\n${error.stdout}` : "";
    throw new Error(`git ${args.join(" ")} failed.${stderr}${stdout}`);
  }
}

async function gitStatusFor(paths) {
  const { stdout } = await git(["status", "--porcelain", "--", ...paths]);
  return stdout.trim();
}

async function commitGeneratedFiles(paths, shouldCommit) {
  if (!shouldCommit || !paths.length) return;
  if (!(await gitStatusFor(paths))) {
    console.log("No generated SVG changes to commit.");
    return;
  }

  await git(["config", "user.name", GIT_AUTHOR_NAME]);
  await git(["config", "user.email", GIT_AUTHOR_EMAIL]);
  await git(["add", "--", ...paths]);

  const { stdout } = await git(["diff", "--cached", "--name-only", "--", ...paths]);
  if (!stdout.trim()) {
    console.log("No generated SVG changes to commit.");
    return;
  }

  await git(["commit", "-m", GENERATED_COMMIT_MESSAGE, "--", ...paths]);
  await git(["push"]);
}

async function writeLanguageSvg(options) {
  const { languages, metric, repos, total } = await generateLanguagesFromGithub(options);
  const outputDir = dirname(options.output);
  if (outputDir !== ".") await mkdir(outputDir, { recursive: true });
  await writeFile(options.output, renderSvg(languages, total, { ...options, metric }), "utf8");
  console.log(`Generated ${options.output} from ${repos.length} repositories using ${metric}.`);
}

export async function main(env = process.env) {
  const envOptions = optionsFromEnv(env);
  const readmeMarkdown = envOptions.readmeConfigPath ? await readFile(envOptions.readmeConfigPath, "utf8") : "";
  const readmeConfigs = parseReadmeConfigEntries(readmeMarkdown);
  if (!readmeConfigs.length) {
    throw new Error(
      `No README GitStats config blocks found in ${envOptions.readmeConfigPath || "README.md"}. Add at least one <!-- gitstats:config --> block.`,
    );
  }
  readmeDisplayMarkers(readmeMarkdown);

  const usedOutputPaths = new Set();
  const generatedFiles = [];
  const generatedCards = [];

  for (const entry of readmeConfigs) {
    const options = mergeConfig(envOptions, entry.config);
    options.output = outputPathForConfig(entry, options, usedOutputPaths);
    validateOptions(options);
    await writeLanguageSvg(options);
    generatedFiles.push(options.output);
    generatedCards.push({ output: options.output, options });
  }

  const updatedReadme = await updateReadmeDisplay(envOptions.readmeConfigPath, readmeMarkdown, generatedCards);
  const commitPaths = updatedReadme ? [...generatedFiles, updatedReadme] : generatedFiles;
  await writeGeneratedFilesOutput(generatedFiles, env);
  await commitGeneratedFiles(commitPaths, envOptions.commit);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
