import type { PublishedModel } from "@ubb/cms-adapter-directus";
import { getPublishedModels } from "@ubb/cms-adapter-directus";

function hasPublishedVersion(model: PublishedModel): boolean {
  return model.model_versions.some((version) => version.status === "published");
}

export async function PublishedModelsPage(): Promise<JSX.Element> {
  const models = await getPublishedModels();
  const modelsWithPublishedVersions = models.filter(hasPublishedVersion);

  return (
    <main>
      <h1>Published Boat Models</h1>
      <ul>
        {modelsWithPublishedVersions.map((model) => {
          const latestPublishedVersion = model.model_versions[0] ?? null;

          return (
            <li key={model.id}>
              <h2>{model.name}</h2>
              <p>Slug: {model.slug}</p>
              <p>
                Latest published version:{" "}
                {latestPublishedVersion
                  ? `${latestPublishedVersion.version_label} (${latestPublishedVersion.published_at ?? "no publish date"})`
                  : "None"}
              </p>
              <p>Published versions: {model.model_versions.length}</p>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

export default PublishedModelsPage;
