export interface OrgConfig {
  max_history_storage: number; // 1-100, default 50
  max_history_llm: number; // 1-50, must be <= max_history_storage
}
