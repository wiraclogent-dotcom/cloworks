import RequestsPage from "./page";

/**
 * Fallback for the implicit `children` slot when Next cannot recover the list underneath an intercepted
 * route (e.g. /requests/[id] opened as a side panel). Without it the route 404s. Renders the list with
 * default filters; the panel in `@modal` still shows the request.
 */
export default function RequestsDefault() {
  return <RequestsPage params={Promise.resolve({})} searchParams={Promise.resolve({})} />;
}
