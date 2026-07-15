import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<p style={{ padding: "4rem", textAlign: "center" }}>Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
