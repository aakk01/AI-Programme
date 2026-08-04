import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export const ThemeToggle = () => {
  const [dark, setDark] = useState(
    () => localStorage.getItem("pow_theme") === "dark",
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("pow_theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <Button
      data-testid="theme-toggle"
      variant="ghost"
      size="icon"
      className="h-8 w-8 rounded-sm"
      onClick={() => setDark((d) => !d)}
      aria-label="Toggle theme"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
};
