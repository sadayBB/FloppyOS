/**
 * Asks the browser to keep FloppyOS data (IndexedDB, session) instead of clearing it under storage
 * pressure. Note: a browser set to «delete site data on close» or a private window still wipes it.
 */
export async function isPersisted() {
  return (await navigator.storage?.persisted?.()) ?? false;
}

export async function requestPersist() {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
