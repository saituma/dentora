export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  price?: number;
}

export interface KnowledgeDocument {
  id: string;
  filename: string;
  status: "processing" | "ready" | "error";
  chunkCount?: number;
  uploadedAt: string;
}

export interface TransferRule {
  id: string;
  condition: string;
  targetNumber: string;
  priority: number;
}
