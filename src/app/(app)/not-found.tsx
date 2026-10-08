import { NotFoundPanel } from "@/components/NotFoundPanel";

/** notFound() inside the signed-in app (e.g. a deleted project): rendered inside the shell, which owns <main>. */
export default function AppNotFound() {
  return <NotFoundPanel className="mx-auto mt-6 max-w-xl" />;
}
