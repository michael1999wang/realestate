import { describe, expect, it } from "vitest";

describe("Web App Integration", () => {
  it("should have web app directory structure", () => {
    // This is a basic smoke test to ensure the web app is properly integrated
    // In a real scenario, you might test API endpoints, build process, etc.

    const fs = require("fs");
    const path = require("path");

    const webDir = path.join(__dirname, "../../web");
    const packageJsonPath = path.join(webDir, "package.json");
    const appDir = path.join(webDir, "app");
    const componentsDir = path.join(webDir, "components");

    // Check if web directory exists
    expect(fs.existsSync(webDir)).toBe(true);

    // Check if package.json exists
    expect(fs.existsSync(packageJsonPath)).toBe(true);

    // Check if app directory exists (Next.js App Router)
    expect(fs.existsSync(appDir)).toBe(true);

    // Check if components directory exists
    expect(fs.existsSync(componentsDir)).toBe(true);

    // Verify package.json has required scripts
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    expect(packageJson.scripts).toHaveProperty("dev");
    expect(packageJson.scripts).toHaveProperty("build");
    expect(packageJson.scripts).toHaveProperty("start");
    expect(packageJson.scripts).toHaveProperty("type-check");

    // Verify required dependencies
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    expect(deps).toHaveProperty("next");
    expect(deps).toHaveProperty("react");
    expect(deps).toHaveProperty("typescript");
    expect(deps).toHaveProperty("@tanstack/react-query");
    expect(deps).toHaveProperty("zustand");
  });

  it("should have proper TypeScript configuration", () => {
    const fs = require("fs");
    const path = require("path");

    const tsconfigPath = path.join(__dirname, "../../web/tsconfig.json");
    expect(fs.existsSync(tsconfigPath)).toBe(true);

    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
    expect(tsconfig.compilerOptions).toBeDefined();
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it("should have required environment configuration", () => {
    const fs = require("fs");
    const path = require("path");

    const envExamplePath = path.join(__dirname, "../../web/.env.example");
    expect(fs.existsSync(envExamplePath)).toBe(true);

    const envContent = fs.readFileSync(envExamplePath, "utf8");
    expect(envContent).toContain("NEXT_PUBLIC_API_URL");
    expect(envContent).toContain("NEXT_PUBLIC_ALERTS_SSE");
  });

  it("should have core application files", () => {
    const fs = require("fs");
    const path = require("path");

    const webDir = path.join(__dirname, "../../web");

    // Check for main layout
    expect(fs.existsSync(path.join(webDir, "app/layout.tsx"))).toBe(true);

    // Check for dashboard pages
    expect(fs.existsSync(path.join(webDir, "app/(dashboard)/page.tsx"))).toBe(
      true
    );
    expect(fs.existsSync(path.join(webDir, "app/(dashboard)/layout.tsx"))).toBe(
      true
    );
    expect(
      fs.existsSync(path.join(webDir, "app/(dashboard)/listings/[id]/page.tsx"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(webDir, "app/(dashboard)/alerts/page.tsx"))
    ).toBe(true);

    // Check for core components
    expect(
      fs.existsSync(path.join(webDir, "components/SearchFilters.tsx"))
    ).toBe(true);
    expect(fs.existsSync(path.join(webDir, "components/ListingCard.tsx"))).toBe(
      true
    );
    expect(fs.existsSync(path.join(webDir, "components/UWSliders.tsx"))).toBe(
      true
    );

    // Check for API types and client
    expect(fs.existsSync(path.join(webDir, "app/api/route-types.d.ts"))).toBe(
      true
    );
    expect(fs.existsSync(path.join(webDir, "lib/api.ts"))).toBe(true);

    // Check for state management
    expect(fs.existsSync(path.join(webDir, "store/useAssumptions.ts"))).toBe(
      true
    );
  });
});
