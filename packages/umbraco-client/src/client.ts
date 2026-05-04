import type {
  CollectionQuery,
  DeliveryApiClientOptions,
  ItemQuery,
  UmbracoItem,
  UmbracoResponse,
} from "./types.js";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeItemPath(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

function buildHeaders(
  options: { apiKey?: string; culture?: string; preview?: boolean },
): Headers {
  const headers = new Headers({ Accept: "application/json" });
  if (options.culture) {
    headers.set("Accept-Language", options.culture);
  }
  if (options.preview && options.apiKey) {
    headers.set("Api-Key", options.apiKey);
  }
  return headers;
}

export interface DeliveryApiClient {
  fetchItem(path: string, query?: ItemQuery): Promise<UmbracoItem>;
  fetchCollection<T = UmbracoItem>(
    query?: CollectionQuery,
  ): Promise<UmbracoResponse<T>>;
}

export function createDeliveryApiClient(
  options: DeliveryApiClientOptions,
): DeliveryApiClient {
  const baseUrl = trimTrailingSlash(options.baseUrl);

  function resolveCulture(culture?: string): string | undefined {
    return culture ?? options.defaultCulture;
  }

  return {
    async fetchItem(path, query = {}) {
      const url = `${baseUrl}/umbraco/delivery/api/v2/content/item${normalizeItemPath(path)}`;
      const culture = resolveCulture(query.culture);
      const headers = buildHeaders({
        apiKey: options.apiKey,
        culture,
        preview: query.preview,
      });

      const requestUrl = new URL(url);
      if (query.preview) {
        requestUrl.searchParams.set("preview", "true");
      }

      const response = await fetch(requestUrl.toString(), { headers });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch from Umbraco: ${response.status} ${response.statusText} ${requestUrl}`,
        );
      }
      return (await response.json()) as UmbracoItem;
    },

    async fetchCollection<T = UmbracoItem>(query: CollectionQuery = {}) {
      const params = new URLSearchParams();
      const filters = Array.isArray(query.filter)
        ? query.filter
        : query.filter
          ? [query.filter]
          : [];
      for (const f of filters) params.append("filter", f);
      if (query.fetch) params.set("fetch", query.fetch);
      if (query.sort) params.set("sort", query.sort);
      if (typeof query.take === "number") params.set("take", String(query.take));
      if (typeof query.skip === "number") params.set("skip", String(query.skip));
      if (query.search) params.set("search", query.search);
      if (query.fields !== undefined) params.set("fields", query.fields);
      if (query.preview) params.set("preview", "true");

      const culture = resolveCulture(query.culture);
      const headers = buildHeaders({
        apiKey: options.apiKey,
        culture,
        preview: query.preview,
      });

      const requestUrl = new URL(`${baseUrl}/umbraco/delivery/api/v2/content`);
      requestUrl.search = params.toString();

      const response = await fetch(requestUrl.toString(), { headers });
      if (!response.ok) {
        throw new Error(
          `Umbraco API error: ${response.status} ${response.statusText} ${requestUrl}`,
        );
      }
      return (await response.json()) as UmbracoResponse<T>;
    },
  };
}
