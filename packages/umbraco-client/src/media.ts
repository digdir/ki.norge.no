import type { UmbracoMedia } from "./types.js";

export function mapMedia(value: unknown): UmbracoMedia | undefined {
  if (!value) return undefined;
  if (Array.isArray(value) && value.length > 0) {
    const media = value[0] as Record<string, unknown>;
    return {
      id: (media.id as string) || "",
      url: ((media.url as string) || (media.mediaUrl as string)) ?? "",
      alternativeText: (media.altText as string) || (media.name as string) || "",
      width: media.width as number | undefined,
      height: media.height as number | undefined,
      focalPoint: media.focalPoint as { left: number; top: number } | undefined,
    };
  }
  if (typeof value === "object" && value !== null) {
    const media = value as Record<string, unknown>;
    return {
      id: (media.id as string) || "",
      url: ((media.url as string) || (media.mediaUrl as string)) ?? "",
      alternativeText: (media.altText as string) || (media.name as string) || "",
      width: media.width as number | undefined,
      height: media.height as number | undefined,
    };
  }
  return undefined;
}

export function getMediaUrl(media?: UmbracoMedia, baseUrl?: string): string | undefined {
  if (!media?.url) return undefined;
  if (media.url.startsWith("http")) return media.url;
  return `${baseUrl ?? ""}${media.url}`;
}
