/**
 * Removes leading interception markers ("(.)", "(..)", "(...)") from a route param.
 *
 * Works around a Next 16.4 dev-server bug: once a route file under /requests is recompiled, the intercepted side
 * panel's `id` param arrives as "(.)<id>" (one more marker per recompile), the lookup misses and the card opens
 * "Page not found". Production builds are not affected. Request ids never start with "(", so this is a no-op there.
 */
export function stripInterceptionMarkers(value: string): string {
  return value.replace(/^(?:\(\.{1,3}\))+/, "");
}
