import { Suspense } from "react";
import { redirectIfOnboardingComplete } from "@/lib/user/onboarding";
import { SetupWizard } from "@/components/setup-wizard";

export default async function SetupPage() {
  await redirectIfOnboardingComplete();

  return (
    <Suspense fallback={<div className="setup-shell">Loading setup…</div>}>
      <SetupWizard />
    </Suspense>
  );
}
