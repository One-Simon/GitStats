import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatMetricValue,
  loadReadmeConfig,
  metricForTimeframe,
  parseTimeframe,
  renderSvg,
} from "../src/generate-languages.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);

const previewSamples = {
  bytes: [
    { language: "TypeScript", value: 5033165 },
    { language: "JavaScript", value: 3355443 },
    { language: "Python", value: 1468006 },
    { language: "Go", value: 901120 },
    { language: "Rust", value: 552960 },
    { language: "Shell", value: 184320 },
    { language: "Dockerfile", value: 98304 },
  ],
  changes: [
    { language: "TypeScript", value: 1480 },
    { language: "Python", value: 760 },
    { language: "Rust", value: 420 },
    { language: "Go", value: 260 },
    { language: "Shell", value: 90 },
  ],
};

function applyPreviewConfig(languages, config) {
  const hide = new Set((config["hide-languages"] || ["HTML", "CSS"]).map((language) => language.toLowerCase()));
  const maxLanguages = Number(config["max-languages"] || 10);

  return languages
    .filter(({ language }) => !hide.has(language.toLowerCase()))
    .slice(0, maxLanguages);
}

async function previewData(timeframe) {
  const config = await loadReadmeConfig("README.md");
  const metric = metricForTimeframe(timeframe);
  const languages = applyPreviewConfig(previewSamples[metric], config);

  return {
    config,
    languages,
    metric,
    total: languages.reduce((sum, language) => sum + language.value, 0),
  };
}

function sampleRows(languages, metric) {
  return languages.map(({ language, value }) => ({
    language,
    metric,
    value,
    formatted: formatMetricValue(value, metric),
  }));
}

function renderOptions(config, timeframe, style, metric) {
  const configTimeframe = config.timeframe ?? "all-time";
  const useConfiguredText = String(configTimeframe) === String(timeframe);

  return {
    style,
    timeframe,
    metric,
    showValues: config["show-values"] ?? true,
    title: useConfiguredText ? config.title : undefined,
    subtitle: useConfiguredText ? config.subtitle : undefined,
  };
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

function send(response, status, body, type = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://localhost:${port}`);
  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  const publicRoot = resolve(root, "public");
  const resolved = resolve(publicRoot, `.${path}`);
  const relativePath = relative(publicRoot, resolved);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    send(response, 403, "Forbidden");
    return;
  }

  try {
    const body = await readFile(resolved);
    send(response, 200, body, mimeTypes[extname(resolved)] || "application/octet-stream");
  } catch {
    send(response, 404, "Not found");
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);

  if (url.pathname === "/api/render.svg" || url.pathname === "/api/current.svg") {
    const style = url.searchParams.get("style") || "normal";
    const timeframe = parseTimeframe(url.searchParams.get("timeframe") || "all-time");
    const { config, languages, metric, total } = await previewData(timeframe);
    send(
      response,
      200,
      renderSvg(languages, total, renderOptions(config, timeframe, style, metric)),
      "image/svg+xml; charset=utf-8",
    );
    return;
  }

  if (url.pathname === "/api/sample.json") {
    const allTime = await previewData("all-time");
    const recent = await previewData(4);
    send(
      response,
      200,
      JSON.stringify({
        config: allTime.config,
        samples: {
          allTime: {
            metric: allTime.metric,
            rows: sampleRows(allTime.languages, allTime.metric),
          },
          recent: {
            timeframe: 4,
            metric: recent.metric,
            rows: sampleRows(recent.languages, recent.metric),
          },
        },
      }, null, 2),
      "application/json; charset=utf-8",
    );
    return;
  }

  await serveStatic(request, response);
});

server.listen(port, () => {
  console.log(`GitStats preview: http://localhost:${port}`);
});
