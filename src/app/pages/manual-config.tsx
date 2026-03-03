import { faPenToSquare } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export function ManualConfigPage() {
  return (
    <div className="bg-dot-grid relative flex min-h-full flex-col items-center justify-center p-8">
      {/* Radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.541_0.168_248/0.08)_0%,transparent_60%)]" />

      <div className="relative flex flex-col items-center gap-6">
        <div className="bg-primary/10 ring-primary/20 flex size-20 items-center justify-center rounded-2xl ring-1">
          <FontAwesomeIcon
            icon={faPenToSquare}
            className="text-primary size-8"
          />
        </div>
        <div className="text-center">
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Manual Configuration
          </h1>
          <p className="text-muted-foreground mt-3 max-w-md text-[15px] leading-relaxed">
            Manually configure MCP servers and prompt overrides — identity,
            methodology, tool guidance, instructions, memory instructions, and
            closing prompt.
          </p>
        </div>
      </div>
    </div>
  );
}
