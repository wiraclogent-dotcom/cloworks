import ProjectsPage from "./page";

/** Fallback for the implicit `children` slot under an intercepted new/edit modal; without it the route 404s. */
export default function ProjectsDefault() {
  return <ProjectsPage />;
}
