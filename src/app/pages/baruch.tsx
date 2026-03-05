import { faMessageBot } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export function BaruchPage() {
  return (
    <div className="bg-dot-grid relative flex min-h-full flex-col items-center justify-center p-8">
      {/* Radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.541_0.168_248/0.08)_0%,transparent_60%)]" />

      <div className="relative flex flex-col items-center gap-6">
        <div className="bg-primary/10 ring-primary/20 flex size-20 items-center justify-center rounded-2xl ring-1">
          <FontAwesomeIcon
            icon={faMessageBot}
            className="text-primary text-4xl"
          />
        </div>
        <div className="text-center">
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Baruch
          </h1>
          <span className="mt-2 inline-flex items-center rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400 dark:ring-amber-400/20">
            Coming Soon
          </span>
          <p className="text-muted-foreground mt-3 max-w-md text-[15px] leading-relaxed">
            Talk to Baruch to configure your BT Servant agent — name, identity,
            teaching methodology, tool guidance, instructions, memory
            instructions, and closing prompt.
          </p>
        </div>
      </div>
    </div>
  );
}
