import { redirect } from "next/navigation";

/** The middleware already gates on the session cookie. */
export default function IndexPage() {
  redirect("/dashboard");
}
