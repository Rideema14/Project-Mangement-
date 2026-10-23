import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Planora | Collaborative Project Management",
  description: "Plan projects, collaborate with your team, and keep tasks moving.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
