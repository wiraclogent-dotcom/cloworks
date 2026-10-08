import { redirect } from "next/navigation";

// The proxy already sends signed-out visitors to /signin; everyone else lands on the board.
export default function Home() {
  redirect("/requests");
}
