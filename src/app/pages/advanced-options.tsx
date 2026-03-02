import { faSliders } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export function AdvancedOptionsPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <FontAwesomeIcon icon={faSliders} className="text-primary/60 size-12" />
      <div className="text-center">
        <h1 className="text-foreground text-xl font-semibold">
          Advanced Options
        </h1>
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
          Fine-tune history limits, storage quotas, and other organization-level
          settings.
        </p>
      </div>
    </div>
  );
}
