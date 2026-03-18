import type { Observation } from "../types/observation";

export interface FilterConfig {
  types: string[];
  keywords: string[];
  tags: string[];
}

export function matchesFilter(obs: Observation, filter: FilterConfig): boolean {
  // Empty filters = nothing exported (safe default per spec)
  if (filter.types.length === 0 && filter.keywords.length === 0 && filter.tags.length === 0) {
    return false;
  }

  // OR logic: any match is enough
  return matchesType(obs, filter.types)
    || matchesKeyword(obs, filter.keywords)
    || matchesTag(obs, filter.tags);
}

function matchesType(obs: Observation, types: string[]): boolean {
  if (types.length === 0) return false;
  return types.includes(obs.type);
}

function matchesKeyword(obs: Observation, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const searchable = [obs.title, obs.narrative, obs.text]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return keywords.some((kw) => searchable.includes(kw.toLowerCase()));
}

function matchesTag(obs: Observation, tags: string[]): boolean {
  if (tags.length === 0) return false;
  const searchable = [obs.title, obs.narrative, obs.text]
    .filter(Boolean)
    .join(" ");

  return tags.some((tag) => searchable.includes(tag));
}
