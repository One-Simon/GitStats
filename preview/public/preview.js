const sampleData = document.querySelector("#sample-data");
const configData = document.querySelector("#config-data");

const response = await fetch("/api/sample.json");
const data = await response.json();
const config = data.config || {};

const configRows = [
  ["README timeframe", String(config.timeframe || "all-time")],
  ["README style", config.style || "normal"],
  ["Grouping", String(config.grouping ?? true)],
  ["Show values", String(config["show-values"] ?? true)],
  ["All-time metric", "bytes"],
  ["Recent metric", "changes"],
  ["Hidden languages", (config["hide-languages"] || ["HTML", "CSS", "JSON"]).join(", ")],
  ["Max languages", String(config["max-languages"] || 10)],
];

configData.innerHTML = configRows
  .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
  .join("");

function rowsForSample(sample) {
  return sample.rows
    .map((item) => `${item.language.padEnd(12)} ${item.formatted}`)
    .join("\n");
}

sampleData.textContent = [
  "Most Used sample (all-time bytes)",
  rowsForSample(data.samples.allTime),
  "",
  "Recent sample (4-week changes)",
  rowsForSample(data.samples.recent),
].join("\n");
