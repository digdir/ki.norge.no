import type { APIRoute } from 'astro';
import { proxyMedia } from '../../lib/media-proxy';

// Images and files from the CMS, served on the portal address. See lib/media-proxy.ts.
const UMBRACO_URL = process.env.UMBRACO_URL || import.meta.env.UMBRACO_URL || 'http://localhost:5000';

export const prerender = false;

export const GET: APIRoute = ({ request }) => proxyMedia(request, UMBRACO_URL);

export const HEAD: APIRoute = ({ request }) => proxyMedia(request, UMBRACO_URL);
