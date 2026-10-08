import { NotFoundPanel } from "@/components/NotFoundPanel";

/** Root not-found (unknown URLs, outside the signed-in shell, so it owns its <main>). */
export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 items-start p-4 sm:p-8">
      <NotFoundPanel className="w-full border-solid border-border shadow-card" />
    </main>
  );
}
