import { describe, expect, it, vi } from "vitest";

import { runConfirmedAction } from "../src/lib/run-confirmed-action";

describe("runConfirmedAction", () => {
  it("clears the error, runs the action, then calls onSuccess on resolve", async () => {
    const setError = vi.fn();
    const onSuccess = vi.fn();
    const action = vi.fn(() => Promise.resolve("ok"));

    await runConfirmedAction(action, setError, onSuccess);

    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenNthCalledWith(1, null);
    expect(action).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("never calls onSuccess if the action rejects (dialog must stay open)", async () => {
    const setError = vi.fn();
    const onSuccess = vi.fn();
    const action = () => Promise.reject(new Error("boom"));

    await runConfirmedAction(action, setError, onSuccess);

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("sets the Error's message on rejection", async () => {
    const setError = vi.fn();
    const action = () => Promise.reject(new Error("permission denied"));

    await runConfirmedAction(action, setError, () => {});

    // First call clears, second call records the failure message.
    expect(setError).toHaveBeenNthCalledWith(2, "permission denied");
  });

  it("uses the fallback message when the thrown value is not an Error", async () => {
    const setError = vi.fn();
    const action = () => Promise.reject("string thrown, not Error");

    await runConfirmedAction(action, setError, () => {}, "Custom fallback.");

    expect(setError).toHaveBeenNthCalledWith(2, "Custom fallback.");
  });

  it("uses the default fallback message when none is provided", async () => {
    const setError = vi.fn();
    const action = () => Promise.reject({ weird: "object" });

    await runConfirmedAction(action, setError, () => {});

    expect(setError).toHaveBeenNthCalledWith(2, "Action failed.");
  });

  it("does not swallow the resolve order — onSuccess only runs after action settles", async () => {
    const events: string[] = [];
    const action = () =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          events.push("action-settled");
          resolve();
        }, 5);
      });
    const setError = () => events.push("setError");
    const onSuccess = () => events.push("onSuccess");

    await runConfirmedAction(action, setError, onSuccess);

    expect(events).toEqual(["setError", "action-settled", "onSuccess"]);
  });
});
