import { mkdir, writeFile } from "node:fs/promises";

const token = process.env.GITSTATS_TOKEN;
const username = process.env.GITSTATS_USERNAME;
const output = process.env.GITSTATS_OUTPUT || "profile/languages.svg";
const maxLanguages = Number(process.env.GITSTATS_MAX_LANGUAGES || 10);
const includeForks = parseBoolean(process.env.GITSTATS_INCLUDE_FORKS);
const includeArchived = parseBoolean(process.env.GITSTATS_INCLUDE_ARCHIVED);
const includeProfileRepo = parseBoolean(process.env.GITSTATS_INCLUDE_PROFILE_REPO);
const affiliation = process.env.GITSTATS_AFFILIATION || "owner";
const visibility = process.env.GITSTATS_VISIBILITY || "all";
const title = process.env.GITSTATS_TITLE || "Most Used Languages";
const subtitle = process.env.GITSTATS_SUBTITLE || "public + private";
const userAgent = process.env.GITSTATS_USER_AGENT || "GitStats-language-card";
const hide = new Set(
  (process.env.GITSTATS_HIDE_LANGUAGES || "HTML,CSS")
    .split(",")
    .map((language) => language.trim().toLowerCase())
    .filter(Boolean),
);

if (!token) throw new Error("GitStats requires a token input.");
if (!username) throw new Error("GitStats requires a username input.");
if (!Number.isFinite(maxLanguages) || maxLanguages < 1) {
  throw new Error("max-languages must be a positive number.");
}

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": userAgent,
};

function parseBoolean(value) {
  return String(value || "false").toLowerCase() === "true";
}

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  return response.json();
}

async function listRepos() {
  const repos = [];
  for (let page = 1; page <= 20; page += 1) {
    const batch = await github(
      `/user/repos?per_page=100&page=${page}&affiliation=${encodeURIComponent(affiliation)}&visibility=${encodeURIComponent(visibility)}&sort=updated`,
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

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function colorFor(language) {
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
  };

  if (colors[language]) return colors[language];
  let hash = 0;
  for (const char of language) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 62% 48%)`;
}

function renderSvg(languages, total) {
  const width = 520;
  const rowHeight = 28;
  const height = 78 + languages.length * rowHeight;
  const barX = 24;
  const barY = 54;
  const barWidth = width - 48;
  let offset = 0;

  const barSegments = languages.map(({ language, bytes }) => {
    const segmentWidth = Math.max(0, (bytes / total) * barWidth);
    const x = barX + offset;
    offset += segmentWidth;
    return `<rect x="${x.toFixed(2)}" y="${barY}" width="${segmentWidth.toFixed(2)}" height="10" fill="${colorFor(language)}" />`;
  }).join("\n    ");

  const rows = languages.map(({ language, bytes }, index) => {
    const y = 92 + index * rowHeight;
    const pct = ((bytes / total) * 100).toFixed(1);
    return `<g transform="translate(24 ${y})">
      <circle cx="5" cy="-4" r="5" fill="${colorFor(language)}" />
      <text x="18" y="0" class="name">${escapeXml(language)}</text>
      <text x="496" y="0" text-anchor="end" class="value">${pct}% · ${formatBytes(bytes)}</text>
    </g>`;
  }).join("\n    ");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">Language usage across GitHub repositories available to the token.</desc>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .title { fill: #24292f; font-size: 18px; font-weight: 600; }
    .meta { fill: #57606a; font-size: 12px; }
    .name { fill: #24292f; font-size: 13px; font-weight: 600; }
    .value { fill: #57606a; font-size: 12px; }
    @media (prefers-color-scheme: dark) {
      .title, .name { fill: #c9d1d9; }
      .meta, .value { fill: #8b949e; }
    }
  </style>
  <text x="24" y="30" class="title">${escapeXml(title)}</text>
  <text x="496" y="30" text-anchor="end" class="meta">${escapeXml(subtitle)}</text>
  <clipPath id="bar"><rect x="24" y="54" width="472" height="10" rx="5" /></clipPath>
  <g clip-path="url(#bar)">
    <rect x="24" y="54" width="472" height="10" fill="#d0d7de" />
    ${barSegments}
  </g>
  ${rows}
</svg>
`;
}

const totals = new Map();
const repos = await listRepos();

for (const repo of repos) {
  const languages = await github(`/repos/${repo.owner.login}/${repo.name}/languages`);
  for (const [language, bytes] of Object.entries(languages)) {
    if (hide.has(language.toLowerCase())) continue;
    totals.set(language, (totals.get(language) || 0) + bytes);
  }
}

const languages = [...totals.entries()]
  .map(([language, bytes]) => ({ language, bytes }))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, maxLanguages);

const total = languages.reduce((sum, language) => sum + language.bytes, 0);

if (!total) {
  throw new Error("No language data found. Check token access, repository visibility, and hidden language filters.");
}

const outputDir = output.split("/").slice(0, -1).join("/");
if (outputDir) await mkdir(outputDir, { recursive: true });
await writeFile(output, renderSvg(languages, total), "utf8");
console.log(`Generated ${output} from ${repos.length} repositories.`);
