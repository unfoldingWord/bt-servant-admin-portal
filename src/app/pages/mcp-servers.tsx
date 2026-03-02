import { faServer } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export function McpServersPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <FontAwesomeIcon icon={faServer} className="text-primary/60 size-12" />
      <div className="text-center">
        <h1 className="text-foreground text-xl font-semibold">MCP Servers</h1>
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
          Manage Model Context Protocol server connections — add, remove, and
          configure external tool providers.
        </p>
      </div>
    </div>
  );
}
