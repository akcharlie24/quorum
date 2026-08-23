import type { Metadata } from "next";
import { AppNav } from "@/components/app-nav";

export const metadata: Metadata = {
  title: {
    default: "Quorum console",
    template: "%s · Quorum",
  },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      <div className="shell">{children}</div>
    </>
  );
}
