import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getModelVersionBundle } from "@ubb/cms-adapter-directus";
import { compileModelVersionBundle, validateBundle } from "../compile.js";
import { hashCompiledConfig } from "../hash.js";
import { persistCompiled } from "../persist.js";

function readEnv(name: string): string | undefined {
  const processLike = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return processLike?.env?.[name];
}

function setExitCode(code: number): void {
  const processLike = (globalThis as { process?: { exitCode?: number } }).process;
  if (processLike) {
    processLike.exitCode = code;
  }
}

async function main(): Promise<void> {
  const processLike = (globalThis as { process?: { argv?: string[] } }).process;
  const argv = processLike?.argv ?? [];
  const modelVersionId = argv[2] ?? readEnv("MODEL_VERSION_ID");

  if (!readEnv("DIRECTUS_API_URL") || !readEnv("DIRECTUS_STATIC_TOKEN")) {
    throw new Error("DIRECTUS_API_URL and DIRECTUS_STATIC_TOKEN are required.");
  }
  if (!modelVersionId) {
    throw new Error("MODEL_VERSION_ID is required (set env var or pass as argv).");
  }

  const bundle = await getModelVersionBundle(modelVersionId);
  if (!bundle) {
    throw new Error(`No published model_version bundle found for "${modelVersionId}".`);
  }

  const validation = validateBundle(bundle);
  if (!validation.ok) {
    console.error(`Validation failed with ${validation.errors.length} error(s):`);
    for (const error of validation.errors.slice(0, 20)) {
      console.error(`- [${error.code}] ${error.path}: ${error.message}`);
    }
    setExitCode(1);
    return;
  }

  const compiled = compileModelVersionBundle(bundle);
  const hash = hashCompiledConfig(compiled);
  const compiledAt = new Date().toISOString();
  compiled.metadata.compiled_hash = hash;
  compiled.metadata.compiled_at = compiledAt;

  const artifactsDir = path.resolve("artifacts");
  await mkdir(artifactsDir, { recursive: true });
  const artifactPath = path.join(artifactsDir, `${bundle.id}.compiled.json`);
  await writeFile(artifactPath, `${JSON.stringify(compiled, null, 2)}\n`, "utf8");

  console.log("Compiled model version");
  console.log(`- model_version_id: ${bundle.id}`);
  console.log(`- model_year: ${bundle.model_year ?? "<unset>"}`);
  console.log(`- version_label: ${bundle.version_label}`);
  console.log(`- hash: ${hash}`);
  console.log(`- artifact: ${artifactPath}`);

  try {
    const persistResult = await persistCompiled(bundle.id, compiled, hash);
    console.log(`- persisted: ${persistResult.persisted ? "yes" : "no"} (${persistResult.stored_payload})`);
    if (persistResult.note) {
      console.log(`- note: ${persistResult.note}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`- persist warning: ${message}`);
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(message);
  setExitCode(1);
});
