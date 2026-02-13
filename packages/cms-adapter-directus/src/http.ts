export class DirectusHttpError extends Error {
  readonly status: number;
  readonly responseBody: string;

  constructor(opts: { method: string; url: string; status: number; responseBody: string }) {
    super(`Directus request failed: ${opts.method} ${opts.url} -> ${opts.status}`);
    this.name = "DirectusHttpError";
    this.status = opts.status;
    this.responseBody = opts.responseBody;
  }
}

export interface DirectusHttpClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions<TBody> {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, unknown>;
  body?: TBody;
}

interface DirectusEnvelope<TData> {
  data: TData;
}

function appendQuery(params: URLSearchParams, prefix: string, value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (value === null) {
    params.append(prefix, "null");
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendQuery(params, prefix, item);
    }
    return;
  }

  if (typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      appendQuery(params, `${prefix}[${key}]`, nestedValue);
    }
    return;
  }

  params.append(prefix, String(value));
}

function buildQueryString(query?: Record<string, unknown>): string {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    appendQuery(params, key, value);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export class DirectusHttpClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DirectusHttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async request<TData, TBody = undefined>(options: RequestOptions<TBody>): Promise<TData> {
    const method = options.method ?? "GET";
    const url = `${this.baseUrl}${options.path}${buildQueryString(options.query)}`;

    const response = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json"
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new DirectusHttpError({
        method,
        url,
        status: response.status,
        responseBody
      });
    }

    const json = (await response.json()) as DirectusEnvelope<TData>;
    return json.data;
  }
}
