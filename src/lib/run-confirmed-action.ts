/**
 * Run a destructive action from a confirmation dialog and route the
 * outcome to dialog-local UI state.
 *
 * Used by the AlertDialog destructive-confirm flow (#102). The dialog
 * stays open across `action()` so an error message can render inline;
 * `onSuccess` is the only path that closes it. `setError(null)` runs
 * up-front to clear any stale error from a previous attempt.
 *
 * @param action     The async work to perform (typically a TanStack
 *                   `mutateAsync` call). Must reject on failure so the
 *                   error path triggers.
 * @param setError   Local-state setter for the dialog's inline error.
 *                   Receives `null` before the call, the error message
 *                   string on rejection.
 * @param onSuccess  Called when `action` resolves. Typical use: close
 *                   the dialog and clean up any local state.
 * @param fallbackMessage Used when the thrown value isn't an `Error`.
 */
export async function runConfirmedAction(
  action: () => Promise<unknown>,
  setError: (message: string | null) => void,
  onSuccess: () => void,
  fallbackMessage = "Action failed."
): Promise<void> {
  setError(null);
  try {
    await action();
    onSuccess();
  } catch (err) {
    setError(err instanceof Error ? err.message : fallbackMessage);
  }
}
