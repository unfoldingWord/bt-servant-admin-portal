export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  authToken?: string;
  enabled: boolean;
  priority: number;
  allowedTools?: string[];
}
