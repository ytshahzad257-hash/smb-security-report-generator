"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark" | "system";

type ThemeToggleProps = {
  className?: string;
  mode?: "icon" | "full";
};

const themeOptions: Array<{
  value: ThemeMode;
  label: string;
  Icon: typeof Sun;
}> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

function ThemeToggle({ className, mode = "icon" }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  const currentTheme: ThemeMode =
    theme === "light" || theme === "dark" || theme === "system" ? theme : "system";
  const displayTheme: ThemeMode = mounted ? currentTheme : "system";

  const selected = themeOptions.find((option) => option.value === displayTheme) ?? themeOptions[2];
  const SelectedIcon = selected.Icon;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={mode === "icon" ? "icon" : "default"}
          className={cn(mode === "full" ? "min-w-36 justify-start gap-2" : undefined, className)}
          aria-label="Select theme"
        >
          <SelectedIcon className="size-4" aria-hidden="true" />
          {mode === "full" ? (
            <span className="text-sm">{selected.label}</span>
          ) : (
            <span className="sr-only">Theme</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup
          value={displayTheme}
          onValueChange={(value) => {
            setTheme(value);
            setOpen(false);
          }}
        >
          {themeOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <option.Icon className="size-4" aria-hidden="true" />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { ThemeToggle };
