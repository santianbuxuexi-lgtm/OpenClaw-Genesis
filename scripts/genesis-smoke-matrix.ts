import fs from "node:fs";
import path from "node:path";
import { assessGenesisServerSmokeMatrix } from "../src/genesis/kernel/server-smoke-matrix.ts";

function parseArgs(argv: string[]) {
  const parsed: Record<string, string[]> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current?.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      parsed[key] = [...(parsed[key] ?? []), "true"];
      continue;
    }
    parsed[key] = [...(parsed[key] ?? []), value];
    index += 1;
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scenarioSpecs = args.scenario ?? [];
  if (scenarioSpecs.length === 0) {
    throw new Error("expected at least one --scenario <name>=<json-file> entry");
  }

  const scenarios = scenarioSpecs.map((spec) => {
    const separatorIndex = spec.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`invalid scenario spec: ${spec}`);
    }
    const name = spec.slice(0, separatorIndex).trim();
    const file = spec.slice(separatorIndex + 1).trim();
    const fullPath = path.resolve(file);
    return {
      name,
      file: fullPath,
      result: JSON.parse(fs.readFileSync(fullPath, "utf8")) as unknown,
    };
  });

  const matrix = assessGenesisServerSmokeMatrix(
    scenarios.map((scenario) => ({
      name: scenario.name,
      result: scenario.result as never,
    })),
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        status: matrix.verdict === "ok" ? "ok" : "needs-attention",
        matrix,
        sources: scenarios.map((scenario) => ({
          name: scenario.name,
          file: scenario.file,
        })),
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

