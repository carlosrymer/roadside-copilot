// Base URL of the deployed AWS API. Falls back to same-origin for local proxying.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
