import axios from "axios";
import { organization } from "../config/organization";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || organization.apiBaseUrl,
  withCredentials: true,
});

export function assetUrl(path: string | null | undefined, fallback = "/brand/nominee-placeholder-v2.png") {
  if (!path) return fallback;
  if (path.startsWith("http") || path.startsWith("/")) return path;
  return `/brand/${path}`;
}
