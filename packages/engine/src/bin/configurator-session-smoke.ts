import { getPublishedModels } from "@ubb/cms-adapter-directus";
import { createConfiguratorSession } from "../configurator-session.js";

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

async function resolveModelVersionId(): Promise<string> {
  const fromEnv = readEnv("MODEL_VERSION_ID");
  if (fromEnv) {
    return fromEnv;
  }

  const models = await getPublishedModels();
  const firstPublished = models.flatMap((model) => model.model_versions)[0];
  if (!firstPublished) {
    throw new Error("No published model versions available.");
  }

  return firstPublished.id;
}

async function main(): Promise<void> {
  const modelVersionId = await resolveModelVersionId();
  const session = await createConfiguratorSession({ modelVersionId });
  const selectedGroupCount = Object.keys(session.selections).length;
  const firstRender = session.renders[0] ?? null;

  console.log("Configurator session smoke");
  console.log(`- modelVersionId: ${session.modelVersionId}`);
  console.log(`- selected group count: ${selectedGroupCount}`);
  console.log(`- colorByAreaKey: ${JSON.stringify(session.colorByAreaKey)}`);
  console.log(`- first render view key: ${firstRender?.viewKey ?? "<none>"}`);
  console.log(`- first data url prefix: ${(firstRender?.dataUrl ?? "").slice(0, 60)}`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(message);
  setExitCode(1);
});
