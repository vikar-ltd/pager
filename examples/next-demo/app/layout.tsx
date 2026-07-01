import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Nav } from "@/components/nav";
import { Tracker } from "@/components/tracker";

export const metadata: Metadata = {
  title: "Pager demo shop",
  description: "Static Next.js App Router site used to smoke-test the Pager tracker.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#fafafa" }}>
        <Nav />
        <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 2rem" }}>{children}</main>
        <Tracker />
      </body>
    </html>
  );
}
