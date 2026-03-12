export interface MemoryEntry {
  content: string;
  updatedAt: number;
  createdAt: number;
  pinned: boolean;
}

export interface MemoryTOCEntry {
  name: string;
  sizeBytes: number;
  pinned: boolean;
}

export interface MemoryTOC {
  entries: MemoryTOCEntry[];
  totalSizeBytes: number;
  maxSizeBytes: number;
}

export interface MemoryResponse {
  toc: MemoryTOC;
  entries: Record<string, MemoryEntry>;
}
