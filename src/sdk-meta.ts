import type { ServerExtensionSettings } from './schema/draft/schema.js';

/** Satisfy MCP SDK JSONObject typing for extension settings advertisement. */
export function toExtensionSettings(settings: ServerExtensionSettings): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (value !== undefined) {
      out[key] = value as string | number | boolean;
    }
  }
  return out;
}
