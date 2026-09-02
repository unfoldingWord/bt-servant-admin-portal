// Trigger a browser download of `blob` under `filename` (#187 export,
// #311 QR). One copy so the revoke timing is decided once: Firefox and
// Safari can begin the download after `click()` returns, and a URL revoked
// in the same task can yield an empty file, so revocation is deferred.
const REVOKE_DELAY_MS = 1000;

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
