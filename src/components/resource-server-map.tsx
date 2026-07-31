import { useMemo } from "react";

import {
  MAP,
  buildResourceMapLayout,
  serverCaption,
} from "@/lib/resource-map-layout";
import { cn } from "@/lib/utils";
import type {
  AggregatedResourcesResponse,
  ResourceServerStatus,
} from "@/types/resources";

// Auto-generated map of the org's MCP-server topology (#261): org → servers →
// subject leaves, projected from the same aggregated response the list view
// renders — no extra fetching, so the map is current by construction. All
// geometry and label text comes from the pure layout helper; this component
// only draws.
//
// The signature encoding: branch strokes carry link health. A solid amber
// branch means the server is listing resources; a dashed branch means the
// link is degraded — muted for "no listing tool" (unsupported, e.g. FIA),
// destructive for a failed response. Same three-way honesty as the status
// chips (#230), extended into the connective tissue.

const BRANCH_STROKE: Record<
  ResourceServerStatus,
  { stroke: string; dash?: string; opacity: number }
> = {
  ok: { stroke: "var(--brand-resources)", opacity: 0.9 },
  unsupported: {
    stroke: "var(--muted-foreground)",
    dash: "4 4",
    opacity: 0.45,
  },
  error: { stroke: "var(--destructive)", dash: "4 4", opacity: 0.7 },
};

const DOT_CLASS: Record<ResourceServerStatus, string> = {
  ok: "fill-emerald-500",
  unsupported: "fill-muted-foreground/40",
  error: "fill-destructive",
};

function LegendSwatch({
  dash,
  className,
}: {
  dash?: string;
  className: string;
}) {
  return (
    <svg width="20" height="6" aria-hidden className="shrink-0">
      <line
        x1="1"
        y1="3"
        x2="19"
        y2="3"
        strokeWidth="1.5"
        strokeDasharray={dash}
        className={className}
      />
    </svg>
  );
}

export function ResourceServerMap({
  data,
}: {
  data: AggregatedResourcesResponse;
}) {
  const layout = useMemo(() => buildResourceMapLayout(data), [data]);
  const { servers } = layout;
  const first = servers[0];
  const last = servers[servers.length - 1];
  if (!first || !last) return null;

  const okCount = servers.filter((s) => s.status === "ok").length;
  const unsupportedCount = servers.filter(
    (s) => s.status === "unsupported"
  ).length;
  const errorCount = servers.filter((s) => s.status === "error").length;
  const totalResources = servers.reduce((sum, s) => sum + s.resourceCount, 0);

  const orgRight = MAP.org.x + MAP.org.width;
  const serverRight = MAP.server.x + MAP.server.width;
  const spineTop = Math.min(first.centerY, layout.orgCenterY);
  const spineBottom = Math.max(last.centerY, layout.orgCenterY);

  return (
    <div className="bg-card overflow-hidden rounded-xl border">
      {/* Assistive-tech equivalent. An aggregate aria-label on the <svg> would
          hand AT users strictly less than the list view — which server failed,
          why, and what each one lists all live in the drawing. SVG text is not
          dependably navigable, so the drawing is hidden outright and the same
          facts are restated here as real DOM structure. Keep in sync with the
          nodes below; both read from the same layout. */}
      <div className="sr-only">
        <h3>
          MCP server map for org {layout.orgName} &mdash; content language
          &ldquo;{data.language}&rdquo;
        </h3>
        <p>
          {servers.length} {servers.length === 1 ? "server" : "servers"}:{" "}
          {okCount} listing resources, {unsupportedCount} without resource
          listing, {errorCount} failed. {totalResources}{" "}
          {totalResources === 1 ? "resource" : "resources"} in total.
        </p>
        <ul>
          {servers.map((server) => (
            <li key={server.serverId}>
              {server.serverName} &mdash;{" "}
              {
                serverCaption(
                  server.status,
                  server.resourceCount,
                  data.language
                ).full
              }
              {server.status === "error" && server.error
                ? `. Error: ${server.error}`
                : null}
              {server.leaves.length > 0 && (
                <ul>
                  {server.leaves.map((leaf) => (
                    <li key={leaf.slug}>
                      {leaf.fullLabel}: {leaf.count}{" "}
                      {leaf.count === 1 ? "resource" : "resources"}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="overflow-x-auto">
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${String(layout.width)} ${String(layout.height)}`}
          aria-hidden
          className="block"
        >
          {/* Org → trunk → spine, in the resources brand amber. */}
          <path
            d={`M ${String(orgRight)} ${String(layout.orgCenterY)} H ${String(
              MAP.spineX
            )} M ${String(MAP.spineX)} ${String(spineTop)} V ${String(
              spineBottom
            )}`}
            fill="none"
            stroke="var(--brand-resources)"
            strokeOpacity={0.55}
            strokeWidth={1.5}
          />

          {/* Org node. */}
          <g>
            {layout.orgDisplayName !== layout.orgName && (
              <title>{layout.orgName}</title>
            )}
            <rect
              x={MAP.org.x}
              y={layout.orgCenterY - MAP.org.height / 2}
              width={MAP.org.width}
              height={MAP.org.height}
              rx={10}
              fill="var(--card)"
              stroke="var(--brand-resources)"
              strokeOpacity={0.6}
              strokeWidth={1.5}
            />
            <text
              x={MAP.org.x + 14}
              y={layout.orgCenterY - 6}
              fontSize={9}
              letterSpacing="0.1em"
              fill="var(--muted-foreground)"
            >
              ORG
            </text>
            <text
              x={MAP.org.x + 14}
              y={layout.orgCenterY + 12}
              fontSize={12.5}
              fontWeight={600}
              fill="var(--foreground)"
            >
              {layout.orgDisplayName}
            </text>
          </g>

          {servers.map((server) => {
            const branch = BRANCH_STROKE[server.status];
            const nodeTop = server.centerY - MAP.server.height / 2;
            const caption = serverCaption(
              server.status,
              server.resourceCount,
              data.language
            );
            // One <title> per node, or the second would be ignored: the full
            // name and the full caption matter exactly when the drawn forms
            // were cut short, and the error detail always matters.
            const titleParts: string[] = [];
            if (server.displayName !== server.serverName) {
              titleParts.push(server.serverName);
            }
            if (caption.display !== caption.full) {
              titleParts.push(caption.full);
            }
            if (server.status === "error" && server.error) {
              titleParts.push(server.error);
            }
            return (
              <g key={server.serverId}>
                {/* Branch: spine → server, stroke style encodes link health. */}
                <line
                  x1={MAP.spineX}
                  y1={server.centerY}
                  x2={MAP.server.x}
                  y2={server.centerY}
                  stroke={branch.stroke}
                  strokeOpacity={branch.opacity}
                  strokeDasharray={branch.dash}
                  strokeWidth={1.5}
                />

                {/* Server node. */}
                <g>
                  {titleParts.length > 0 && (
                    <title>{titleParts.join(" — ")}</title>
                  )}
                  <rect
                    x={MAP.server.x}
                    y={nodeTop}
                    width={MAP.server.width}
                    height={MAP.server.height}
                    rx={9}
                    fill="var(--card)"
                    stroke={
                      server.status === "error"
                        ? "var(--destructive)"
                        : "var(--border)"
                    }
                    strokeOpacity={server.status === "error" ? 0.5 : 1}
                    strokeDasharray={
                      server.status === "unsupported" ? "4 4" : undefined
                    }
                  />
                  <circle
                    cx={MAP.server.x + 16}
                    cy={server.centerY - 8}
                    r={3}
                    className={DOT_CLASS[server.status]}
                  />
                  <text
                    x={MAP.server.x + 26}
                    y={server.centerY - 4}
                    fontSize={12}
                    fontWeight={500}
                    fill="var(--foreground)"
                  >
                    {server.displayName}
                  </text>
                  <text
                    x={MAP.server.x + 26}
                    y={server.centerY + 13}
                    fontSize={10}
                    fill={
                      server.status === "error"
                        ? "var(--destructive)"
                        : "var(--muted-foreground)"
                    }
                    fillOpacity={server.status === "error" ? 0.9 : 1}
                  >
                    {caption.display}
                  </text>
                </g>

                {/* Subject leaves — only where resources were actually listed. */}
                {server.leaves.map((leaf) => {
                  const leafCenterY = leaf.y + MAP.leaf.height / 2;
                  return (
                    <g key={leaf.slug}>
                      <path
                        d={`M ${String(serverRight)} ${String(
                          server.centerY
                        )} H ${String(MAP.leafSpineX)} V ${String(
                          leafCenterY
                        )} H ${String(MAP.leaf.x)}`}
                        fill="none"
                        stroke="var(--border)"
                        strokeWidth={1.25}
                        strokeLinejoin="round"
                      />
                      {/* The chip gets its own group so a truncated label's
                          <title> is scoped to the chip rather than to the
                          elbow feeding it. Same pattern as the server node. */}
                      <g>
                        {leaf.label !== leaf.fullLabel && (
                          <title>{leaf.fullLabel}</title>
                        )}
                        <rect
                          x={MAP.leaf.x}
                          y={leaf.y}
                          width={leaf.width}
                          height={MAP.leaf.height}
                          rx={MAP.leaf.height / 2}
                          fill="var(--accent)"
                          fillOpacity={0.5}
                          stroke="var(--border)"
                        />
                        <text
                          x={MAP.leaf.x + 12}
                          y={leaf.y + 17}
                          fontSize={11}
                          fill="var(--foreground)"
                          fillOpacity={0.85}
                        >
                          {leaf.label}
                        </text>
                        <text
                          x={MAP.leaf.x + leaf.width - 12}
                          y={leaf.y + 17}
                          fontSize={11}
                          textAnchor="end"
                          fill="var(--muted-foreground)"
                          className="tabular-nums"
                        >
                          {leaf.count}
                        </text>
                      </g>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div
        className={cn(
          "text-muted-foreground border-border/60 flex flex-wrap items-center",
          "gap-x-4 gap-y-1 border-t px-4 py-2.5 text-[11px]"
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <LegendSwatch className="stroke-(--brand-resources)" />
          listing resources
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LegendSwatch dash="4 4" className="stroke-muted-foreground/50" />
          no listing tool
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LegendSwatch dash="4 4" className="stroke-destructive/70" />
          failed to respond
        </span>
        <span className="ml-auto">
          Generated live for &ldquo;{data.language}&rdquo; &middot;{" "}
          {totalResources} {totalResources === 1 ? "resource" : "resources"}
        </span>
      </div>
    </div>
  );
}
