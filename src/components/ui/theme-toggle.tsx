import { Moon, Sun } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [isMounted, setIsMounted] = React.useState(false);
  const [isDarkMode, setIsDarkMode] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
    const storedTheme =
      typeof window !== "undefined"
        ? window.localStorage.getItem("theme")
        : null;
    const prefersDark =
      typeof window !== "undefined"
        ? window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches
        : false;
    const shouldUseDark = storedTheme ? storedTheme === "dark" : prefersDark;

    setIsDarkMode(shouldUseDark);
    const root = document.documentElement;
    root.classList.toggle("dark", shouldUseDark);
  }, []);

  const handleToggle = React.useCallback(() => {
    const nextIsDark = !isDarkMode;
    setIsDarkMode(nextIsDark);
    const root = document.documentElement;
    root.classList.toggle("dark", nextIsDark);
    try {
      window.localStorage.setItem("theme", nextIsDark ? "dark" : "light");
    } catch {}
  }, [isDarkMode]);

  if (!isMounted) {
    return (
      <Button variant="ghost" size="sm" aria-label="Toggle theme" disabled>
        <Sun className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      aria-label="Toggle theme"
    >
      {isDarkMode ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}
