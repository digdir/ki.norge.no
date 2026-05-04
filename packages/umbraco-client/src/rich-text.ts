import type { RichTextNode, UmbracoBlock } from "./types.js";

const SELF_CLOSING = new Set(["br", "hr", "img", "input"]);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderAttributes(attrs?: Record<string, string>): string {
  if (!attrs || Object.keys(attrs).length === 0) return "";
  return Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${escapeHtml(value)}"`)
    .join("");
}

function nodeToPlainText(node: RichTextNode): string {
  if (node.tag === "#text") return node.text || "";
  if (node.tag === "#comment") return "";
  return (node.elements || []).map(nodeToPlainText).join("");
}

export function richTextToHtml(node: RichTextNode): string {
  if (node.tag === "#text") {
    return escapeHtml(node.text || "");
  }

  if (node.tag === "#root") {
    return (node.elements || []).map(richTextToHtml).join("");
  }

  if (node.tag === "#comment") return "";

  const children = (node.elements || []).map(richTextToHtml).join("");

  if (/^h[1-6]$/.test(node.tag)) {
    const text = nodeToPlainText(node);
    const id = text
      .toLowerCase()
      .replace(/[^a-zæøå0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const attrs = renderAttributes(node.attributes);
    return `<${node.tag}${attrs} id="${id}">${children}</${node.tag}>`;
  }

  const attrs = renderAttributes(node.attributes);

  if (SELF_CLOSING.has(node.tag)) {
    return `<${node.tag}${attrs} />`;
  }

  return `<${node.tag}${attrs}>${children}</${node.tag}>`;
}

export function getPlainText(blocks?: UmbracoBlock[], maxLength?: number): string {
  if (!blocks || blocks.length === 0) return "";
  const html = blocks
    .filter((b) => b.contentType === "tekst")
    .map((b) => (b.content.innhold as string) || "")
    .join(" ");
  const text = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  if (maxLength && text.length > maxLength) {
    return text.slice(0, maxLength).replace(/\s+\S*$/, "") + "…";
  }
  return text;
}
