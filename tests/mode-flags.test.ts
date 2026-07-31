import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODE_FLAGS,
  readModeFlags,
  reconcileModeFlags,
} from "../src/lib/mode-flags";

describe("readModeFlags", () => {
  it("coerces both absent keys to false", () => {
    expect(readModeFlags({ published: undefined })).toEqual({
      published: false,
      requires_group: false,
    });
  });

  it("returns the defaults for a missing mode", () => {
    expect(readModeFlags(undefined)).toEqual(DEFAULT_MODE_FLAGS);
    expect(readModeFlags(null)).toEqual(DEFAULT_MODE_FLAGS);
  });

  it("passes explicit booleans through in both directions", () => {
    expect(readModeFlags({ published: true, requires_group: false })).toEqual({
      published: true,
      requires_group: false,
    });
    expect(readModeFlags({ published: false, requires_group: true })).toEqual({
      published: false,
      requires_group: true,
    });
  });

  it("reads each key independently when only one is present", () => {
    expect(readModeFlags({ requires_group: true })).toEqual({
      published: false,
      requires_group: true,
    });
  });
});

describe("reconcileModeFlags", () => {
  const sent = { published: true, requires_group: true };

  it("takes the server echo when it agrees with what we sent", () => {
    expect(reconcileModeFlags(sent, { ...sent })).toEqual(sent);
  });

  it("lets a server-echoed false win over a sent true", () => {
    // The `??`-not-`||` case: another writer (or a worker-side rule) landed
    // a different value than we asked for. Server truth wins, so the UI
    // shows what is actually stored instead of what we hoped for.
    expect(
      reconcileModeFlags(sent, { published: false, requires_group: false })
    ).toEqual({ published: false, requires_group: false });
  });

  it("reconciles each flag independently", () => {
    expect(
      reconcileModeFlags(sent, { published: false, requires_group: true })
    ).toEqual({ published: false, requires_group: true });
  });

  it("falls back to the sent value for a key the worker omitted", () => {
    // The worker's `compactOptional` drops keys whose stored value is
    // `undefined`. Anything we sent explicitly was just merged in, so the
    // sent value is the correct fallback.
    expect(reconcileModeFlags(sent, { published: true })).toEqual(sent);
    expect(reconcileModeFlags(sent, {})).toEqual(sent);
  });

  it("falls back wholesale when there is no response payload", () => {
    expect(reconcileModeFlags(sent, undefined)).toEqual(sent);
    expect(reconcileModeFlags(sent, null)).toEqual(sent);
  });

  it("keeps a sent false when the worker omits the key", () => {
    // Turning a flag OFF is the fragile direction: `false` must not be
    // resurrected as `true` by the fallback.
    const off = { published: false, requires_group: false };
    expect(reconcileModeFlags(off, {})).toEqual(off);
  });

  it("does not alias the sent object", () => {
    const out = reconcileModeFlags(sent, undefined);
    expect(out).not.toBe(sent);
  });
});
