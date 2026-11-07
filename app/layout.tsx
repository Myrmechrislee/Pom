import type { Metadata } from "next";
import { DEFAULT_PREFERENCES, THEMES } from "@/lib/types";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pom — A little focus goes a long way",
  description:
    "Your cozy corner for meaningful work. A thoughtful focus timer, calming backgrounds, and room to grow.",
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme={DEFAULT_PREFERENCES.theme} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var theme=localStorage.getItem("pom.theme");if(!theme){var workspace=JSON.parse(localStorage.getItem("pom.workspace.guest")||"null");theme=workspace&&workspace.preferences&&workspace.preferences.theme;}if(${JSON.stringify(THEMES.map((theme) => theme.id))}.includes(theme)){document.documentElement.dataset.theme=theme;localStorage.setItem("pom.theme",theme);}}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
