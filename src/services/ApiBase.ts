// Centralized API base URL — uses relative paths for Vercel Edge Functions
export function getApiBase(): string {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return '';
}
