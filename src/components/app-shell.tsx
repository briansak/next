import { getAuthSession } from "@/lib/auth";
import { AppNav } from "./app-nav";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getAuthSession();

  return (
    <>
      {session ? (
        <AppNav
          tenantLabel={session.partnerName ?? "Local"}
          displayName={session.name ?? "You"}
        />
      ) : null}
      {children}
    </>
  );
}
