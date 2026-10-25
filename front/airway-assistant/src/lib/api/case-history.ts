import { deviceFetch } from "@/lib/api/device-fetch";
import type { AirwayCase } from "@/lib/domain/types";

export interface ServerCase {
  id: string;
  full_name: string;
  created_at: string;
  age: number;
  sex: "M" | "F";
  height_cm: string | number;
  weight_kg: string | number;
  neck_movement: string;
  previous_difficult_intubation: string;
  is_complete: boolean;
  photo_count: number;
}

export type CaseHistoryEntry = {
  id: string;
  name: string;
  createdAt: string;
} & (
  | { source: "local"; local: AirwayCase }
  | { source: "server"; server: ServerCase }
);

export async function fetchServerCases(): Promise<ServerCase[]> {
  const response = await deviceFetch("/api/sync/cases");
  if (!response.ok) throw new Error(`CASE_HISTORY_${response.status}`);
  const cases: unknown = await response.json();
  if (!Array.isArray(cases) || !cases.every((item) =>
    item && typeof item.id === "string" &&
    typeof item.full_name === "string" &&
    typeof item.is_complete === "boolean" &&
    typeof item.created_at === "string" &&
    Number.isFinite(Date.parse(item.created_at)),
  )) throw new Error("INVALID_CASE_HISTORY");
  return cases;
}

/** Local records win: a server draft must never overwrite pending local work. */
export function mergeCaseHistory(local: AirwayCase[], server: ServerCase[]): CaseHistoryEntry[] {
  const entries = new Map<string, CaseHistoryEntry>();
  for (const item of server) {
    entries.set(item.id, {
      id: item.id, name: item.full_name, createdAt: item.created_at,
      source: "server", server: item,
    });
  }
  for (const item of local) {
    entries.set(item.id, {
      id: item.id, name: item.clinical.fullName || item.caseCode,
      createdAt: item.createdAt, source: "local", local: item,
    });
  }
  return [...entries.values()].sort((a, b) =>
    Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id),
  );
}
