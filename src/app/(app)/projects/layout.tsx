/** `modal` renders the intercepted new/edit forms over the list on in-app navigation; a refresh shows the full page. */
export default function ProjectsLayout({ children, modal }: LayoutProps<"/projects">) {
  return <>{children}{modal}</>;
}
