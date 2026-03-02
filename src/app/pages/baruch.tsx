import { faMessageBot } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export function BaruchPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <FontAwesomeIcon
        icon={faMessageBot}
        className="text-primary/60 size-12"
      />
      <div className="text-center">
        <h1 className="text-foreground text-xl font-semibold">Baruch</h1>
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
          Configure your Baruch assistant — prompt overrides, personality, and
          conversation settings.
        </p>
      </div>
    </div>
  );
}
