import { useMemo, useState } from "react";
import { faSpinnerThird } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  ChevronRight,
  ExternalLink,
  List,
  Network,
  RotateCw,
} from "lucide-react";

import { safeResourceHref } from "@/lib/resource-href";
import {
  buildServerNameMap,
  resolveServerLabel,
  type ServerNameMap,
} from "@/lib/resource-servers";
import { subjectLabel } from "@/lib/resource-subjects";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { OrgContextSelector } from "@/components/org-context-selector";
import { PageHeader } from "@/components/page-header";
import { ResourceServerMap } from "@/components/resource-server-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useResources } from "@/hooks/use-resources";
import type { ResourceItem, ResourceServerReport } from "@/types/resources";

// Server chips render the `servers[]` status block honestly (#230 / worker
// #257): `ok` and `unsupported` and `error` are distinct states, never
// conflated — "this server has no listing tool" (FIA) is not a failure,
// and a transient failure is not a capability gap.
function ServerChip({
  server,
  onRetry,
  isRetrying,
}: {
  server: ResourceServerReport;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        server.status === "error"
          ? "border-destructive/40 text-destructive"
          : "border-border text-muted-foreground"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          server.status === "ok" && "bg-emerald-500",
          server.status === "unsupported" && "bg-muted-foreground/40",
          server.status === "error" && "bg-destructive"
        )}
      />
      <span className="text-foreground/80 font-medium">
        {server.serverName}
      </span>
      {server.status === "unsupported" && <span>no resource listing</span>}
      {server.status === "error" && (
        <>
          <span title={server.error}>failed to respond</span>
          <button
            type="button"
            className="hover:text-foreground inline-flex items-center gap-1 underline underline-offset-2"
            onClick={onRetry}
            disabled={isRetrying}
          >
            <RotateCw className="size-3" />
            Retry
          </button>
        </>
      )}
    </span>
  );
}

// Source attribution, resolved from `servers[]` (#230 "indicate the source MCP
// server for each resource"). Renders the human-readable serverName rather than
// the machine id — the same attribution the topology map and the priority panel
// already show — with the id retained in the tooltip. serverName is untrusted
// third-party text, so it arrives collapsed and character-bounded from
// lib/resource-servers; the extra `max-w` is a CSS backstop for a name that is
// short in characters but wide in glyphs.
function ServerBadge({
  serverId,
  serverNames,
}: {
  serverId: string;
  serverNames: ServerNameMap;
}) {
  const label = resolveServerLabel(serverId, serverNames);
  return (
    <Badge
      variant="outline"
      className="max-w-[14rem] truncate px-1.5 py-0 text-[10px]"
      title={label.title}
    >
      {label.display}
    </Badge>
  );
}

function ResourceRow({
  item,
  serverNames,
}: {
  item: ResourceItem;
  serverNames: ServerNameMap;
}) {
  // Scheme-guarded: item.url is third-party MCP server output relayed by
  // the worker — see lib/resource-href.ts.
  const href = safeResourceHref(item.url);
  const meta = [
    item.organization,
    item.version && `v${item.version}`,
    item.articleCount !== undefined &&
      `${String(item.articleCount)} article${item.articleCount === 1 ? "" : "s"}`,
  ].filter(Boolean);

  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2">
      <span className="text-foreground text-sm font-medium">
        {item.label || item.name}
      </span>
      {item.label && (
        <code className="text-muted-foreground text-[11px]">{item.name}</code>
      )}
      <ServerBadge serverId={item.serverId} serverNames={serverNames} />
      {meta.length > 0 && (
        <span className="text-muted-foreground text-xs">
          {meta.join(" · ")}
        </span>
      )}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline underline-offset-2"
        >
          Source
          <ExternalLink className="size-3" />
        </a>
      )}
    </li>
  );
}

export function ResourcesPage() {
  const contextOrg = useUiStore((s) => s.contextOrg);

  // The endpoint takes an IETF-style content-language code ("en", "sw",
  // "es-419") — deliberately NOT the org's tuning-language slugs, which are
  // free-form names like "indonesian" and aren't valid here. Hence a code
  // input rather than a language dropdown.
  const [languageInput, setLanguageInput] = useState("en");
  const [language, setLanguage] = useState("en");

  const resources = useResources(language, contextOrg);
  const data = resources.data;

  const subjects = useMemo(() => Object.entries(data?.resources ?? {}), [data]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (slug: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  // Two projections of the same query — the browsable list and the topology
  // map (#261). No separate fetch: the map renders whatever the list has.
  const [view, setView] = useState<"list" | "map">("list");

  // Memoized so the attribution map below has a stable identity across renders
  // (same reason `subjects` is memoized off `data`).
  const servers = useMemo(() => data?.servers ?? [], [data]);
  // One join for the whole page: every per-resource and per-subject badge below
  // resolves its attribution through this map rather than re-scanning servers[].
  const serverNames = useMemo(() => buildServerNameMap(servers), [servers]);
  const noneListable =
    servers.length > 0 && servers.every((s) => s.status !== "ok");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = languageInput.trim();
    if (next) setLanguage(next);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        variant="resources"
        title="Resources"
        subtitle="Everything BT Servant can draw on for answers, grouped by category and resolved per language across your org's connected servers."
      />

      <div className="bg-card flex flex-wrap items-end gap-3 border-b p-4 sm:p-6">
        <OrgContextSelector />
        <form className="flex items-end gap-2" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="resources-language" className="text-xs">
              Content language
            </Label>
            <Input
              id="resources-language"
              value={languageInput}
              onChange={(e) => setLanguageInput(e.target.value)}
              placeholder="en"
              className="h-8 w-32 text-sm"
              aria-describedby="resources-language-hint"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={!languageInput.trim() || resources.isFetching}
          >
            Load
          </Button>
          <p
            id="resources-language-hint"
            className="text-muted-foreground pb-1.5 text-xs"
          >
            IETF code — en, sw, es-419
          </p>
        </form>
        <div
          role="group"
          aria-label="View"
          className="bg-muted/40 ml-auto flex items-center gap-0.5 rounded-lg border p-0.5"
        >
          <button
            type="button"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              view === "list"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="size-3.5" />
            List
          </button>
          <button
            type="button"
            aria-pressed={view === "map"}
            onClick={() => setView("map")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              view === "map"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Network className="size-3.5" />
            Map
          </button>
        </div>
      </div>

      <div className="config-grid-bg min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {resources.error && (
            <div
              className="bg-destructive/10 text-destructive border-destructive rounded-lg border-l-2 px-4 py-3 text-sm"
              role="alert"
            >
              {resources.error.message}
            </div>
          )}

          {resources.isLoading ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-16">
              <FontAwesomeIcon
                icon={faSpinnerThird}
                className="size-5 animate-spin"
              />
              <p className="text-sm">Loading resources...</p>
            </div>
          ) : data ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {servers.map((server) => (
                  <ServerChip
                    key={server.serverId}
                    server={server}
                    onRetry={() => void resources.refetch()}
                    isRetrying={resources.isFetching}
                  />
                ))}
              </div>

              {servers.length === 0 ? (
                <div className="bg-card rounded-xl border px-6 py-10 text-center">
                  <p className="text-foreground text-sm font-medium">
                    No servers are connected for this org
                  </p>
                  <p className="text-muted-foreground mx-auto mt-2 max-w-md text-xs leading-relaxed">
                    Resource listings come from the org&rsquo;s MCP servers, and
                    none are configured yet.
                  </p>
                </div>
              ) : view === "map" ? (
                <ResourceServerMap data={data} />
              ) : noneListable ? (
                <div className="bg-card rounded-xl border px-6 py-10 text-center">
                  <p className="text-foreground text-sm font-medium">
                    This org&rsquo;s servers don&rsquo;t support resource
                    listing
                  </p>
                  <p className="text-muted-foreground mx-auto mt-2 max-w-md text-xs leading-relaxed">
                    None of the connected servers expose a resource catalog, so
                    there&rsquo;s nothing to browse here. They can still answer
                    questions — this only affects the inventory view.
                  </p>
                </div>
              ) : subjects.length === 0 ? (
                <div className="bg-card rounded-xl border px-6 py-10 text-center">
                  <p className="text-foreground text-sm font-medium">
                    No resources found for &ldquo;{data.language}&rdquo;
                  </p>
                  <p className="text-muted-foreground mx-auto mt-2 max-w-md text-xs leading-relaxed">
                    The connected servers responded but listed nothing for this
                    language. Try another language code.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {subjects.map(([slug, items]) => {
                    const isOpen = expanded.has(slug);
                    const serverIds = [
                      ...new Set(items.map((i) => i.serverId)),
                    ];
                    return (
                      <li
                        key={slug}
                        className={cn(
                          "bg-card overflow-hidden rounded-xl border transition-colors",
                          isOpen && "border-l-2"
                        )}
                        style={
                          isOpen
                            ? { borderLeftColor: "var(--brand-resources)" }
                            : undefined
                        }
                      >
                        <button
                          type="button"
                          className="hover:bg-accent/40 flex w-full items-center gap-3 px-4 py-3 text-left"
                          onClick={() => toggle(slug)}
                          aria-expanded={isOpen}
                        >
                          <ChevronRight
                            className={cn(
                              "text-muted-foreground size-4 shrink-0 transition-transform",
                              isOpen && "rotate-90"
                            )}
                          />
                          <span className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold">
                            {subjectLabel(slug)}
                          </span>
                          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                            {items.length}{" "}
                            {items.length === 1 ? "resource" : "resources"}
                          </span>
                          <span className="hidden shrink-0 gap-1 sm:flex">
                            {serverIds.map((id) => (
                              <ServerBadge
                                key={id}
                                serverId={id}
                                serverNames={serverNames}
                              />
                            ))}
                          </span>
                        </button>
                        {isOpen && (
                          <ul className="divide-border/60 border-border/60 divide-y border-t px-4 pt-1 pb-2 pl-11">
                            {items.map((item) => (
                              <ResourceRow
                                key={`${item.serverId}:${item.name}`}
                                item={item}
                                serverNames={serverNames}
                              />
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
