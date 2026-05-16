import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(filePath) {
  return readFile(filePath, "utf8");
}

test("root layout wires ThemeProvider with system default and hydration guard", async () => {
  const layout = await source("src/app/layout.tsx");

  assert.match(layout, /ThemeProvider/);
  assert.match(layout, /suppressHydrationWarning/);
  assert.match(layout, /attribute="class"/);
  assert.match(layout, /defaultTheme="system"/);
  assert.match(layout, /enableSystem/);
});

test("theme toggle exposes light, dark, and system options", async () => {
  const toggle = await source("src/components/theme/theme-toggle.tsx");

  assert.match(toggle, /useTheme/);
  assert.match(toggle, /value:\s*"light"/);
  assert.match(toggle, /value:\s*"dark"/);
  assert.match(toggle, /value:\s*"system"/);
  assert.match(toggle, /setTheme\(value\)/);
  assert.match(toggle, /DropdownMenuRadioGroup/);
});

test("dashboard and settings surface appearance controls without touching privileged APIs", async () => {
  const topbar = await source("src/components/dashboard/dashboard-topbar.tsx");
  const settingsPage = await source("src/app/dashboard/settings/page.tsx");

  assert.match(topbar, /ThemeToggle/);
  assert.match(topbar, /NotificationBell/);
  assert.match(topbar, /href="\/dashboard\/profile"/);
  assert.match(settingsPage, /Appearance/);
  assert.match(settingsPage, /ThemeToggle mode="full"/);
});
