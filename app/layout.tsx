import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pom — A little focus goes a long way",
  description:
    "Your cozy corner for meaningful work. A thoughtful focus timer, calming backgrounds, and room to grow.",
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
