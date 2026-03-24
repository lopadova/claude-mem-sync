/** Row shape from claude-mem's observations table */
export interface Observation {
  id: number;
  memory_session_id: string;
  type: string;
  title: string;
  narrative: string | null;
  text: string | null;
  facts: string | null;
  concepts: string | null;
  files_read: string | null;
  files_modified: string | null;
  created_at_epoch: number;
  project?: string;
}

/** Observation with computed eviction score */
export interface ScoredObservation extends Observation {
  score: number;
}

/** Export JSON file format */
export interface ExportFile {
  version: number;
  exportedBy: string;
  exportedAt: string;
  exportedAtEpoch: number;
  project: string;
  packageVersion: string;
  filters: {
    types: string[];
    keywords: string[];
    tags: string[];
  };
  observations: Observation[];
  observationCount: number;
}
