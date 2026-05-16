import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeServerHeaderExposure,
  scanTechDetection,
} from "../src/lib/scanners/techDetectionScanner.ts";
import { buildOwaspChecklist } from "../src/lib/scanners/owaspChecklistBuilder.ts";

function createFetch(routeMap = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname;
    const route = routeMap[path] ?? routeMap["*"] ?? {
      body: "Not found",
      status: 404,
    };

    calls.push({
      method: init.method,
      path,
      url,
    });

    if (route instanceof Error) {
      throw route;
    }

    return new Response(route.body ?? "", {
      headers: route.headers ?? {},
      status: route.status ?? 200,
    });
  };

  return {
    calls,
    fetcher,
  };
}

function scanWithRoutes(routeMap) {
  const { calls, fetcher } = createFetch(routeMap);
  const result = scanTechDetection(
    {
      normalizedUrl: "https://example.com",
      rootDomain: "example.com",
      scanId: "scan_1",
      targetUrl: "https://example.com",
    },
    {
      fetch: fetcher,
      now: () => new Date("2026-05-13T00:00:00.000Z"),
      validateSafeTarget: async () => undefined,
    },
  );

  return {
    calls,
    result,
  };
}

test("WordPress markers in homepage HTML are detected cautiously", async () => {
  const { result } = scanWithRoutes({
    "/": {
      body: `
        <html>
          <head>
            <link href="/wp-content/themes/acme/style.css" rel="stylesheet">
            <script src="/wp-includes/js/jquery/jquery.min.js"></script>
          </head>
        </html>
      `,
    },
  });
  const scan = await result;

  assert.equal(scan.techSummary.wordpressDetected, true);
  assert.deepEqual(scan.techSummary.technologiesDetected.includes("WordPress"), true);
  assert.match(scan.techSummary.wordpressEvidence.join(" "), /wp-content/);
  assert.equal(
    scan.findings.some(
      (finding) => finding.title === "WordPress indicators detected.",
    ),
    true,
  );
});

test("WordPress meta generator version creates a LOW disclosure finding", async () => {
  const { result } = scanWithRoutes({
    "/": {
      body: '<meta name="generator" content="WordPress 6.5.4">',
    },
  });
  const scan = await result;
  const finding = scan.findings.find(
    (item) => item.title === "WordPress version exposed in meta generator",
  );

  assert.equal(finding?.severity, "LOW");
  assert.equal(finding?.confidence, "HIGH");
  assert.equal(finding?.category, "Technology Detection");
  assert.match(finding?.evidence ?? "", /WordPress 6\.5\.4/);
  assert.equal(
    finding?.impact,
    "Visible CMS version details can help fingerprint the stack.",
  );
});

test("WooCommerce markers in homepage HTML are detected", async () => {
  const { result } = scanWithRoutes({
    "/": {
      body: `
        <script>
          var woocommerce_params = {};
        </script>
        <script src="/wp-content/plugins/woocommerce/assets/js/frontend/cart-fragments.min.js"></script>
        <script src="/wp-content/plugins/woocommerce/assets/js/frontend/wc-cart-fragments.min.js"></script>
      `,
    },
  });
  const scan = await result;

  assert.equal(scan.techSummary.woocommerceDetected, true);
  assert.deepEqual(scan.techSummary.technologiesDetected.includes("WooCommerce"), true);
  assert.match(scan.techSummary.woocommerceEvidence.join(" "), /WooCommerce|woocommerce/);
});

test("detailed server version exposure creates a LOW finding", () => {
  const findings = analyzeServerHeaderExposure({
    scanId: "scan_1",
    serverHeader: "Apache/2.4.58",
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].title, "Server version exposed in response header");
  assert.equal(findings[0].severity, "LOW");
  assert.equal(findings[0].confidence, "HIGH");
  assert.equal(findings[0].evidence, "Apache/2.4.58");
});

test("generic server header does not create a version exposure finding", () => {
  const findings = analyzeServerHeaderExposure({
    scanId: "scan_1",
    serverHeader: "nginx",
  });

  assert.equal(findings.length, 0);
});

test("/wp-admin HTTP 404 creates no WordPress finding and is Not found", async () => {
  const { result } = scanWithRoutes({
    "/wp-admin": {
      body: "Not found",
      status: 404,
    },
  });
  const scan = await result;
  const pathCheck = scan.techSummary.exposedPathChecks.find(
    (check) => check.path === "/wp-admin",
  );

  assert.equal(scan.techSummary.wordpressDetected, false);
  assert.equal(pathCheck?.status, "Not found");
  assert.equal(pathCheck?.evidence, "/wp-admin responded with HTTP 404.");
  assert.equal(
    scan.findings.some((item) => item.title === "WordPress indicators detected."),
    false,
  );
});

test("/xmlrpc.php HTTP 404 creates no XML-RPC finding and is Not found", async () => {
  const { result } = scanWithRoutes({
    "/xmlrpc.php": {
      body: "Not found",
      status: 404,
    },
  });
  const scan = await result;
  const pathCheck = scan.techSummary.exposedPathChecks.find(
    (check) => check.path === "/xmlrpc.php",
  );

  assert.equal(scan.techSummary.xmlRpcAccessible, false);
  assert.equal(pathCheck?.status, "Not found");
  assert.equal(pathCheck?.evidence, "/xmlrpc.php responded with HTTP 404.");
  assert.equal(
    scan.findings.some((item) => item.title === "XML-RPC endpoint appears reachable"),
    false,
  );
});

test("/phpmyadmin HTTP 404 creates no phpMyAdmin finding and is Not found", async () => {
  const { result } = scanWithRoutes({
    "/phpmyadmin": {
      body: "Not found",
      status: 404,
    },
  });
  const scan = await result;
  const pathCheck = scan.techSummary.exposedPathChecks.find(
    (check) => check.path === "/phpmyadmin",
  );

  assert.equal(pathCheck?.status, "Not found");
  assert.equal(pathCheck?.evidence, "/phpmyadmin responded with HTTP 404.");
  assert.equal(
    scan.findings.some((item) =>
      item.title.includes("phpMyAdmin indicators were observed"),
    ),
    false,
  );
});

test("generic HTTP 200 HTML fallback for /phpmyadmin creates no phpMyAdmin finding", async () => {
  const { result } = scanWithRoutes({
    "*": {
      body: "<html><title>App shell</title><div id=\"root\"></div></html>",
      headers: {
        "Content-Type": "text/html",
      },
      status: 200,
    },
  });
  const scan = await result;
  const pathCheck = scan.techSummary.exposedPathChecks.find(
    (check) => check.path === "/phpmyadmin",
  );

  assert.equal(
    scan.findings.some((item) =>
      item.title.includes("phpMyAdmin indicators were observed"),
    ),
    false,
  );
  assert.equal(pathCheck?.status, "Inconclusive");
  assert.equal(
    pathCheck?.evidence,
    "Path returned HTTP 200, but no product-specific exposure indicators were found.",
  );
});

test("generic HTTP 200 HTML fallback for /wp-login.php creates no WordPress login finding", async () => {
  const { result } = scanWithRoutes({
    "*": {
      body: "<html><title>App shell</title><main>Sign in</main></html>",
      headers: {
        "Content-Type": "text/html",
      },
      status: 200,
    },
  });
  const scan = await result;

  assert.equal(scan.techSummary.wordpressDetected, false);
  assert.equal(
    scan.findings.some(
      (item) => item.title === "WordPress login page appears publicly reachable.",
    ),
    false,
  );
  assert.equal(
    scan.techSummary.exposedPathChecks.find((check) => check.path === "/wp-login.php")
      ?.status,
    "Inconclusive",
  );
});

test("generic HTTP 200 HTML fallback for /wp-admin creates no WordPress finding", async () => {
  const { result } = scanWithRoutes({
    "*": {
      body: "<html><title>App shell</title><main>Dashboard route</main></html>",
      headers: {
        "Content-Type": "text/html",
      },
      status: 200,
    },
  });
  const scan = await result;
  const pathCheck = scan.techSummary.exposedPathChecks.find(
    (check) => check.path === "/wp-admin",
  );

  assert.equal(scan.techSummary.wordpressDetected, false);
  assert.equal(pathCheck?.status, "Inconclusive");
  assert.equal(
    scan.findings.some((item) => item.title === "WordPress indicators detected."),
    false,
  );
});

test("generic HTTP 200 HTML fallback for /wp-json creates no WordPress finding", async () => {
  const { result } = scanWithRoutes({
    "*": {
      body: "<html><title>App shell</title><main>JSON route fallback</main></html>",
      headers: {
        "Content-Type": "text/html",
      },
      status: 200,
    },
  });
  const scan = await result;

  assert.equal(scan.techSummary.wordpressDetected, false);
  assert.equal(
    scan.findings.some((item) => item.title === "WordPress indicators detected."),
    false,
  );
});

test("generic HTTP 200 HTML fallback for /xmlrpc.php creates no XML-RPC finding", async () => {
  const { result } = scanWithRoutes({
    "*": {
      body: "<html><title>App shell</title><main>RPC route fallback</main></html>",
      headers: {
        "Content-Type": "text/html",
      },
      status: 200,
    },
  });
  const scan = await result;

  assert.equal(scan.techSummary.xmlRpcAccessible, false);
  assert.equal(
    scan.findings.some((item) => item.title === "XML-RPC endpoint appears reachable"),
    false,
  );
  assert.equal(
    scan.techSummary.exposedPathChecks.find((check) => check.path === "/xmlrpc.php")
      ?.status,
    "Inconclusive",
  );
});

test("generic HTTP 200 HTML fallback for /.env creates no .env finding", async () => {
  const { result } = scanWithRoutes({
    "*": {
      body: "<html><title>App shell</title><main>Not found</main></html>",
      headers: {
        "Content-Type": "text/html",
      },
      status: 200,
    },
  });
  const scan = await result;

  assert.equal(
    scan.findings.some((item) => item.title === ".env file appears accessible"),
    false,
  );
});

test("real phpMyAdmin marker creates a MEDIUM finding", async () => {
  const { result } = scanWithRoutes({
    "/phpmyadmin": {
      body: '<html><title>phpMyAdmin login</title><input name="pma_username"></html>',
      headers: {
        "Content-Type": "text/html",
      },
      status: 200,
    },
  });
  const scan = await result;
  const finding = scan.findings.find(
    (item) => item.title === "phpMyAdmin indicators were observed at /phpmyadmin.",
  );

  assert.equal(finding?.severity, "MEDIUM");
  assert.equal(finding?.confidence, "HIGH");
});

test(".env accessible creates a HIGH finding", async () => {
  const { result } = scanWithRoutes({
    "/.env": {
      body: "APP_ENV=production\nDB_PASSWORD=secret",
      headers: {
        "Content-Type": "text/plain",
      },
      status: 200,
    },
  });
  const scan = await result;
  const finding = scan.findings.find(
    (item) => item.title === ".env file appears accessible",
  );

  assert.equal(finding?.severity, "HIGH");
  assert.equal(finding?.confidence, "HIGH");
  assert.match(finding?.evidence ?? "", /\.env/);
});

test("ZIP magic for /backup.zip creates a HIGH finding", async () => {
  const { result } = scanWithRoutes({
    "/backup.zip": {
      body: "PK\u0003\u0004archive-content",
      headers: {
        "Content-Type": "text/plain",
      },
      status: 200,
    },
  });
  const scan = await result;
  const finding = scan.findings.find(
    (item) => item.title === "Backup archive appears publicly reachable",
  );

  assert.equal(finding?.severity, "HIGH");
  assert.equal(finding?.confidence, "HIGH");
});

test(".git accessible creates a HIGH finding", async () => {
  const { result } = scanWithRoutes({
    "/.git/": {
      body: "Index of /.git\n[DIR] refs\npacked-refs",
      headers: {
        "Content-Type": "text/plain",
      },
      status: 200,
    },
  });
  const scan = await result;
  const finding = scan.findings.find(
    (item) => item.title === ".git directory appears accessible",
  );

  assert.equal(finding?.severity, "HIGH");
  assert.equal(finding?.confidence, "HIGH");
  assert.match(finding?.evidence ?? "", /Git repository indicators/);
});

test(".git forbidden response does not create a finding", async () => {
  const { result } = scanWithRoutes({
    "/.git/": {
      body: "Forbidden",
      status: 403,
    },
  });
  const scan = await result;

  assert.equal(
    scan.findings.some(
      (item) => item.title === ".git directory appears accessible",
    ),
    false,
  );
});

test("/admin and /login redirects alone do not create findings", async () => {
  const { result } = scanWithRoutes({
    "/admin": {
      headers: {
        Location: "/dashboard",
      },
      status: 302,
    },
    "/login": {
      headers: {
        Location: "/account/login",
      },
      status: 302,
    },
  });
  const scan = await result;

  assert.equal(scan.findings.length, 0);
});

test("public wp-login creates a LOW observation", async () => {
  const { result } = scanWithRoutes({
    "/wp-login.php": {
      body: '<form id="loginform" action="wp-login.php"><input name="wp-submit"></form>',
      headers: {
        "Content-Type": "text/html",
      },
      status: 200,
    },
  });
  const scan = await result;
  const finding = scan.findings.find(
    (item) => item.title === "WordPress login page appears publicly reachable.",
  );

  assert.equal(finding?.severity, "LOW");
  assert.equal(finding?.confidence, "MEDIUM");
  assert.match(finding?.impact ?? "", /not a vulnerability by itself/);
});

test("real wp-json JSON with wp/v2 namespace creates WordPress observation", async () => {
  const { result } = scanWithRoutes({
    "/wp-json/": {
      body: JSON.stringify({
        namespaces: ["wp/v2"],
        routes: {
          "/wp/v2/posts": {},
        },
      }),
      headers: {
        "Content-Type": "application/json",
      },
      status: 200,
    },
  });
  const scan = await result;

  assert.equal(scan.techSummary.wordpressDetected, true);
  assert.equal(
    scan.findings.some((item) => item.title === "WordPress indicators detected."),
    true,
  );
});

test("generic HTTP 200 fallback does not contaminate OWASP checklist", async () => {
  const { result } = scanWithRoutes({
    "*": {
      body: "<html><title>App shell</title><main>Not found</main></html>",
      headers: {
        "Content-Type": "text/html",
      },
      status: 200,
    },
  });
  const scan = await result;
  const owasp = buildOwaspChecklist({
    completedModules: {
      httpHeaders: true,
      techDetection: true,
    },
    findings: scan.findings,
    scanId: "scan_1",
  });
  const securityMisconfiguration = owasp.checklistItems.find(
    (item) => item.categoryName === "Security Misconfiguration",
  );

  assert.equal(scan.findings.length, 0);
  assert.equal(securityMisconfiguration?.status, "PASSED");
  assert.equal(owasp.remediationSummary.immediateAttention.length, 0);
  assert.equal(owasp.remediationSummary.recommendedHardening.length, 0);
});

test("XML-RPC reachable finding uses cautious HTTP status wording", async () => {
  const { result } = scanWithRoutes({
    "/xmlrpc.php": {
      body: "XML-RPC server accepts POST requests only.",
      status: 405,
    },
  });
  const scan = await result;
  const finding = scan.findings.find(
    (item) => item.title === "XML-RPC endpoint appears reachable",
  );
  const pathCheck = scan.techSummary.exposedPathChecks.find(
    (check) => check.path === "/xmlrpc.php",
  );

  assert.equal(finding?.severity, "MEDIUM");
  assert.equal(finding?.confidence, "MEDIUM");
  assert.equal(pathCheck?.status, "Reachable");
  assert.equal(pathCheck?.findingTitle, "XML-RPC endpoint appears reachable");
  assert.equal(
    finding?.evidence,
    "The /xmlrpc.php endpoint responded with HTTP 405 to a safe request.",
  );
});
