import Link from "next/link";
import { ConfiguratorClient } from "../../components/configurator-client";
import { createInitialConfiguratorData, pickModelVersion } from "../../lib/server/configurator-data";
import { checkRequiredDirectusEnv } from "../../lib/server/directus-env";

interface ConfiguratorPageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

function modelVersionSelector(args: {
  choices: Array<{ modelVersionId: string; label: string }>;
  currentModelVersionId: string | null;
}): JSX.Element {
  return (
    <form action="/configurator" method="GET" className="grid max-w-xl gap-2 rounded-lg border border-slate-200 bg-white p-4">
      <label htmlFor="modelVersionId" className="text-sm font-medium text-slate-700">
        Select model version
      </label>
      <select
        id="modelVersionId"
        name="modelVersionId"
        defaultValue={args.currentModelVersionId ?? ""}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-sky-500 focus:ring-2"
      >
        <option value="">Choose model version</option>
        {args.choices.map((choice) => (
          <option key={choice.modelVersionId} value={choice.modelVersionId}>
            {choice.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="w-fit rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Load
      </button>
    </form>
  );
}

export default async function ConfiguratorPage(props: ConfiguratorPageProps): Promise<JSX.Element> {
  const env = checkRequiredDirectusEnv();
  if (!env.ok) {
    return (
      <main className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-8 md:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Directus env vars missing</h1>
        <p className="text-sm text-slate-700">
          Set the missing variables in <code>apps/web/.env.local</code> and restart the dev server.
        </p>
        <ul className="list-inside list-disc rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {env.missing.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
        <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-4 text-sm text-slate-100">
{`DIRECTUS_API_URL=http://localhost:8055
DIRECTUS_STATIC_TOKEN=YOUR_APP_READER_TOKEN
MODEL_VERSION_ID=`}
        </pre>
      </main>
    );
  }

  const rawModelVersionId = props.searchParams?.modelVersionId;
  const selectedModelVersionId = typeof rawModelVersionId === "string" ? rawModelVersionId : null;
  const selection = await pickModelVersion({ selectedModelVersionId });

  if (selection.choices.length === 0 && !selection.modelVersionId) {
    return (
      <main className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-8 md:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Configurator</h1>
        <p className="text-sm text-slate-700">No published model versions yet. Publish a model_version in Directus.</p>
        <p>
          <Link className="text-sm font-medium text-sky-700 hover:text-sky-600" href="/">
            Back to home
          </Link>
        </p>
      </main>
    );
  }

  if (!selection.modelVersionId) {
    return (
      <main className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-8 md:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Configurator</h1>
        <p className="text-sm text-slate-700">Multiple published model versions are available. Choose one to start.</p>
        {modelVersionSelector({
          choices: selection.choices,
          currentModelVersionId: selectedModelVersionId
        })}
      </main>
    );
  }

  try {
    const data = await createInitialConfiguratorData({
      modelVersionId: selection.modelVersionId,
      apiUrl: env.apiUrl
    });

    return (
      <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-8 md:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Configurator</h1>
        {selection.choices.length > 1 && selection.source !== "env"
          ? modelVersionSelector({
              choices: selection.choices,
              currentModelVersionId: data.modelVersionId
            })
          : null}

        {selection.source === "env" ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Using <code>MODEL_VERSION_ID</code> from server environment.
          </p>
        ) : null}

        <ConfiguratorClient
          showCopyModelVersionIdButton={selection.choices.length > 1}
          data={data}
        />
      </main>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return (
      <main className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-8 md:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Configurator</h1>
        {selection.choices.length > 1 && selection.source !== "env"
          ? modelVersionSelector({
              choices: selection.choices,
              currentModelVersionId: selectedModelVersionId
            })
          : null}
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          Failed to create configurator session: {message}
        </p>
      </main>
    );
  }
}
