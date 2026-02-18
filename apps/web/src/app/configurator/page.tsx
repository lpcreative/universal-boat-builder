import Link from "next/link";
import { ConfiguratorClient } from "../../components/configurator-client";
import { createInitialConfiguratorData, pickModelVersion } from "../../lib/server/configurator-data";

interface ConfiguratorPageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

function modelVersionSelector(args: {
  choices: Array<{ modelVersionId: string; label: string }>;
  currentModelVersionId: string | null;
}): JSX.Element {
  return (
    <form action="/configurator" method="GET" style={{ display: "grid", gap: 8, maxWidth: 560 }}>
      <label htmlFor="modelVersionId">Select model version</label>
      <select id="modelVersionId" name="modelVersionId" defaultValue={args.currentModelVersionId ?? ""}>
        <option value="">-- Choose model version --</option>
        {args.choices.map((choice) => (
          <option key={choice.modelVersionId} value={choice.modelVersionId}>
            {choice.label}
          </option>
        ))}
      </select>
      <button type="submit">Load</button>
    </form>
  );
}

export default async function ConfiguratorPage(props: ConfiguratorPageProps): Promise<JSX.Element> {
  const rawModelVersionId = props.searchParams?.modelVersionId;
  const selectedModelVersionId = typeof rawModelVersionId === "string" ? rawModelVersionId : null;
  const selection = await pickModelVersion({ selectedModelVersionId });

  if (selection.choices.length === 0 && !selection.modelVersionId) {
    return (
      <main>
        <h1>Configurator</h1>
        <p>No published model versions yet. Publish a model_version in Directus.</p>
        <p>
          <Link href="/">Back to home</Link>
        </p>
      </main>
    );
  }

  if (!selection.modelVersionId) {
    return (
      <main style={{ display: "grid", gap: 16 }}>
        <h1>Configurator</h1>
        <p>Multiple published model versions are available. Choose one to start.</p>
        {modelVersionSelector({
          choices: selection.choices,
          currentModelVersionId: selectedModelVersionId
        })}
      </main>
    );
  }

  try {
    const data = await createInitialConfiguratorData({ modelVersionId: selection.modelVersionId });

    return (
      <main style={{ display: "grid", gap: 16 }}>
        <h1>Configurator</h1>
        {selection.choices.length > 1 && selection.source !== "env"
          ? modelVersionSelector({
              choices: selection.choices,
              currentModelVersionId: data.modelVersionId
            })
          : null}

        {selection.source === "env" ? <p>Using MODEL_VERSION_ID from server environment.</p> : null}

        <ConfiguratorClient
          modelVersionId={data.modelVersionId}
          showCopyModelVersionIdButton={selection.choices.length > 1}
          selectionGroups={data.selectionGroups}
          initialSelections={data.selections}
          initialDataUrl={data.initialDataUrl}
          initialColorByAreaKey={data.colorByAreaKey}
        />
      </main>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return (
      <main style={{ display: "grid", gap: 16 }}>
        <h1>Configurator</h1>
        {selection.choices.length > 1 && selection.source !== "env"
          ? modelVersionSelector({
              choices: selection.choices,
              currentModelVersionId: selectedModelVersionId
            })
          : null}
        <p style={{ color: "#b00020" }}>Failed to create configurator session: {message}</p>
      </main>
    );
  }
}
