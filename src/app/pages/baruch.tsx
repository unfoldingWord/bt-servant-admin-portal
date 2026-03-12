import { BaruchChatPane } from "@/components/baruch-chat-pane";
import { PageHeader } from "@/components/page-header";

export function BaruchPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Baruch Configuration Agent"
        subtitle="Chat with Baruch to configure your BT Servant agent."
      />

      {/* Chat area — dot grid background */}
      <div className="bg-dot-grid min-h-0 flex-1 overflow-hidden">
        <BaruchChatPane />
      </div>
    </div>
  );
}
