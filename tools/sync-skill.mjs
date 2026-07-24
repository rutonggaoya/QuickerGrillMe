import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = resolve(repositoryRoot, "skills", "quicker-grill-me");
const mode = process.argv[2];

if (mode !== "--write" && mode !== "--check") {
  throw new Error("Usage: node tools/sync-skill.mjs --write|--check");
}

function normalizedPath(path) {
  return path.replaceAll("\\", "/");
}

function generatedHeader(sourcePath, targetPath) {
  const source = normalizedPath(sourcePath);
  const extension = extname(targetPath);
  if (extension === ".js") {
    return `// Generated from ${source} by tools/sync-skill.mjs. Do not edit.\n`;
  }
  if (extension === ".css") {
    return `/* Generated from ${source} by tools/sync-skill.mjs. Do not edit. */\n`;
  }
  if (extension === ".html") {
    return `<!-- Generated from ${source} by tools/sync-skill.mjs. Do not edit. -->\n`;
  }
  return "";
}

async function generatedContent(sourcePath, targetPath) {
  const source = await readFile(resolve(repositoryRoot, sourcePath), "utf8");
  const header = generatedHeader(sourcePath, targetPath);
  if (source.startsWith("#!")) {
    const lineEnd = source.indexOf("\n");
    return `${source.slice(0, lineEnd + 1)}${header}${source.slice(lineEnd + 1)}`;
  }
  return `${header}${source}`;
}

const runtimeFileNames = [
  "cli.js",
  "errors.js",
  "order.js",
  "paginate.js",
  "persistence.js",
  "review.js",
  "select.js",
  "server.js",
  "types.js",
  "validate.js"
];

const compiledFiles = runtimeFileNames.map((name) => ({
    source: `dist/src/${name}`,
    target: `scripts/runtime/${name}`
  }));

const mappings = [
  ...compiledFiles,
  { source: "public/app.js", target: "public/app.js" },
  { source: "public/app.css", target: "public/app.css" },
  { source: "public/index.html", target: "public/index.html" },
  {
    source: "schema/questionnaire.schema.json",
    target: "references/questionnaire.schema.json"
  },
  { source: "schema/answers.schema.json", target: "references/answers.schema.json" },
  { source: "examples/questionnaire.json", target: "assets/questionnaire.example.json" }
];

const expectedFiles = new Map();
for (const mapping of mappings) {
  expectedFiles.set(mapping.target, await generatedContent(mapping.source, mapping.target));
}

const manifest = {
  schemaVersion: 1,
  generatedBy: "tools/sync-skill.mjs",
  files: Object.fromEntries(
    [...expectedFiles.entries()].map(([target, content]) => {
      const source = mappings.find((mapping) => mapping.target === target)?.source;
      if (source === undefined) {
        throw new Error(`Missing source mapping for ${target}`);
      }
      return [
        target,
        {
          source,
          sha256: createHash("sha256").update(content).digest("hex")
        }
      ];
    })
  )
};
const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;

async function writeDistribution() {
  for (const generatedDirectory of ["scripts/runtime", "public", "references"]) {
    await rm(resolve(skillRoot, generatedDirectory), { recursive: true, force: true });
  }
  for (const [target, content] of expectedFiles) {
    const outputPath = resolve(skillRoot, target);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, "utf8");
  }
  await writeFile(resolve(skillRoot, "generated-manifest.json"), manifestContent, "utf8");
  process.stdout.write(`Synchronized ${expectedFiles.size} generated skill files.\n`);
}

async function checkDistribution() {
  const stale = [];
  for (const [target, expected] of expectedFiles) {
    try {
      const actual = await readFile(resolve(skillRoot, target), "utf8");
      if (actual !== expected) {
        stale.push(target);
      }
    } catch {
      stale.push(target);
    }
  }
  try {
    const actualManifest = await readFile(
      resolve(skillRoot, "generated-manifest.json"),
      "utf8"
    );
    if (actualManifest !== manifestContent) {
      stale.push("generated-manifest.json");
    }
  } catch {
    stale.push("generated-manifest.json");
  }

  const expectedRuntimeNames = new Set(
    compiledFiles.map(({ target }) => relative("scripts/runtime", target))
  );
  try {
    for (const name of await readdir(resolve(skillRoot, "scripts", "runtime"))) {
      if (!expectedRuntimeNames.has(name)) {
        stale.push(`scripts/runtime/${name}`);
      }
    }
  } catch {
    stale.push("scripts/runtime");
  }

  if (stale.length > 0) {
    throw new Error(
      `Generated skill distribution is stale:\n${[...new Set(stale)]
        .map((path) => `- ${normalizedPath(path)}`)
        .join("\n")}\nRun npm run build:skill.`
    );
  }
  process.stdout.write(`Verified ${expectedFiles.size} generated skill files.\n`);
}

if (mode === "--write") {
  await writeDistribution();
} else {
  await checkDistribution();
}
