/** `modal` renders an intercepted request detail as a side panel over the list on in-app navigation; a refresh shows the full page. */
export default function RequestsLayout({ children, modal }: LayoutProps<"/requests">) {
  return <>{children}{modal}</>;
}
