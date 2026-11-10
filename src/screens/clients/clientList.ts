import type { Client, ClientSummary, Id } from '../../domain/types';

/** Largest open balance first, then by name. */
export function sortClients(list: Client[], summaries: Map<Id, ClientSummary>): Client[] {
  return [...list].sort((a, b) => {
    const d = (summaries.get(b.id)?.outstanding ?? 0) - (summaries.get(a.id)?.outstanding ?? 0);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
}
