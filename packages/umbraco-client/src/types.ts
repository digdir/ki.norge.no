export interface FetchOptions {
  preview?: boolean;
  locale?: string;
}

export interface UmbracoItem {
  id: string;
  name: string;
  contentType: string;
  createDate: string;
  updateDate: string;
  route: { path: string; startItem: { id: string; path: string } };
  properties: Record<string, unknown>;
  cultures: Record<string, { path: string; startItem: { id: string; path: string } }>;
}

export interface UmbracoResponse<T = UmbracoItem> {
  total: number;
  items: T[];
}

export interface UmbracoBlock {
  contentType: string;
  content: Record<string, unknown>;
}

export interface UmbracoMedia {
  id: string;
  url: string;
  alternativeText?: string;
  width?: number;
  height?: number;
  focalPoint?: { left: number; top: number };
}

export interface RichTextNode {
  tag: string;
  text?: string;
  attributes?: Record<string, string>;
  elements?: RichTextNode[];
}

export interface CollectionQuery {
  filter?: string | string[];
  fetch?: string;
  sort?: string;
  skip?: number;
  take?: number;
  preview?: boolean;
  culture?: string;
  search?: string;
  fields?: string;
}

export interface ItemQuery {
  culture?: string;
  preview?: boolean;
}

export interface DeliveryApiClientOptions {
  baseUrl: string;
  apiKey?: string;
  defaultCulture?: string;
}
