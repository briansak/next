import { redirect } from "next/navigation";
import { getLocalUser } from "@/lib/user/onboarding";

export default async function HomePage() {
  const user = await getLocalUser();

  if (user?.onboardingComplete) {
    redirect("/dashboard");
  }

  redirect("/setup");
}
