import type { Metadata } from "next";
import { LoginScreen } from "./login-screen";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { reason } = await searchParams;
  return <LoginScreen notice={reason === "inactive" ? "Tài khoản đã bị khoá. Liên hệ admin." : undefined} />;
}
