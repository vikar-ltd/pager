import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default function HomePage() {
  const hasCookie = cookies().has("pgr_admin");
  redirect(hasCookie ? "/dashboard" : "/login");
}
