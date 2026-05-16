import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyDnsError,
  scanEmailSecurity,
} from "../src/lib/scanners/emailSecurityScanner.ts";

const NO_RECORD = Symbol("NO_RECORD");

const baseTxtRecords = {
  "example.com": ["v=spf1 include:_spf.example.com -all"],
  "_dmarc.example.com": ["v=DMARC1; p=reject; rua=mailto:dmarc@example.com"],
  "default._domainkey.example.com": ["v=DKIM1; k=rsa; p=test"],
};

test("classifyDnsError separates missing records from resolver failures", () => {
  assert.equal(
    classifyDnsError(Object.assign(new Error("missing"), { code: "NODATA" })),
    "RECORD_NOT_FOUND",
  );
  assert.equal(
    classifyDnsError(Object.assign(new Error("temporary"), { code: "EAI_AGAIN" })),
    "DNS_LOOKUP_FAILED",
  );
});

function noRecordError() {
  return Object.assign(new Error("No DNS records found."), {
    code: "ENODATA",
  });
}

function createResolver({ mxRecords, txtRecords } = {}) {
  const txtMap = {
    ...baseTxtRecords,
    ...txtRecords,
  };

  return {
    async resolveMx() {
      if (mxRecords === NO_RECORD) {
        throw noRecordError();
      }

      return (
        mxRecords ?? [
          {
            exchange: "mail.example.com",
            priority: 10,
          },
        ]
      );
    },
    async resolveTxt(domain) {
      const value = txtMap[domain.toLowerCase()];

      if (value === NO_RECORD || value === undefined) {
        throw noRecordError();
      }

      return value.map((record) => [record]);
    },
  };
}

function scanWithResolver(resolver) {
  return scanEmailSecurity(
    {
      normalizedUrl: "https://www.example.com",
      rootDomain: "example.com",
      scanId: "scan_1",
      targetUrl: "https://www.example.com",
    },
    {
      now: () => new Date("2026-05-13T00:00:00.000Z"),
      resolver,
    },
  );
}

test("SPF missing creates a MEDIUM finding", async () => {
  const result = await scanWithResolver(
    createResolver({
      txtRecords: {
        "example.com": ["google-site-verification=test"],
      },
    }),
  );
  const finding = result.findings.find(
    (item) => item.title === "Missing SPF record",
  );

  assert.equal(finding?.severity, "MEDIUM");
  assert.equal(finding?.confidence, "HIGH");
  assert.equal(
    finding?.evidence,
    "No SPF TXT record starting with v=spf1 was found.",
  );
  assert.equal(
    result.logs.some((log) => log.level === "ERROR"),
    false,
  );
});

test("SPF +all creates a HIGH finding", async () => {
  const result = await scanWithResolver(
    createResolver({
      txtRecords: {
        "example.com": ["v=spf1 +all"],
      },
    }),
  );
  const finding = result.findings.find(
    (item) => item.title === "SPF record allows any sender",
  );

  assert.equal(finding?.severity, "HIGH");
  assert.equal(finding?.confidence, "HIGH");
  assert.equal(
    finding?.evidence,
    "SPF record contains +all, which allows any sender.",
  );
});

test("multiple SPF records creates a MEDIUM finding", async () => {
  const result = await scanWithResolver(
    createResolver({
      txtRecords: {
        "example.com": [
          "v=spf1 include:_spf.example.com -all",
          "v=spf1 include:mail.example.com -all",
        ],
      },
    }),
  );
  const finding = result.findings.find(
    (item) => item.title === "Multiple SPF records found",
  );

  assert.equal(finding?.severity, "MEDIUM");
  assert.equal(
    finding?.evidence,
    "Multiple SPF records were found. Domains should publish only one SPF record.",
  );
});

test("DMARC missing creates a MEDIUM finding", async () => {
  const result = await scanWithResolver(
    createResolver({
      txtRecords: {
        "_dmarc.example.com": NO_RECORD,
      },
    }),
  );
  const finding = result.findings.find(
    (item) => item.title === "Missing DMARC record",
  );

  assert.equal(finding?.severity, "MEDIUM");
  assert.equal(
    finding?.evidence,
    "No DMARC record was found at _dmarc.example.com.",
  );
});

test("DMARC p=none creates a LOW finding", async () => {
  const result = await scanWithResolver(
    createResolver({
      txtRecords: {
        "_dmarc.example.com": ["v=DMARC1; p=none; rua=mailto:dmarc@example.com"],
      },
    }),
  );
  const finding = result.findings.find(
    (item) => item.title === "DMARC policy is monitoring-only",
  );

  assert.equal(finding?.severity, "LOW");
  assert.equal(finding?.confidence, "HIGH");
  assert.equal(
    finding?.evidence,
    "DMARC policy is set to p=none, which is monitoring-only.",
  );
});

test("DMARC p=reject creates no negative finding", async () => {
  const result = await scanWithResolver(createResolver());

  assert.equal(result.emailSecuritySummary.dmarcPolicy, "reject");
  assert.equal(
    result.findings.some((item) => item.title.includes("DMARC")),
    false,
  );
});

test("missing MX with SPF -all and DMARC reject creates INFO observation", async () => {
  const result = await scanWithResolver(
    createResolver({
      mxRecords: NO_RECORD,
    }),
  );
  const finding = result.findings.find(
    (item) => item.title === "Domain appears configured not to receive mail",
  );

  assert.equal(finding?.severity, "INFO");
  assert.equal(finding?.confidence, "HIGH");
  assert.equal(
    finding?.evidence,
    "No MX records were found, while SPF uses -all and DMARC policy is reject.",
  );
  assert.equal(finding?.impact, "The domain may intentionally not receive email.");
  assert.equal(
    result.findings.some((item) => item.title === "Missing MX records"),
    false,
  );
});

test("DKIM common selectors not found creates an INFO finding with LOW confidence", async () => {
  const result = await scanWithResolver(
    createResolver({
      txtRecords: {
        "default._domainkey.example.com": NO_RECORD,
      },
    }),
  );
  const finding = result.findings.find(
    (item) =>
      item.title === "No DKIM record found for common selectors tested",
  );
  const dkimLogs = result.logs.filter(
    (log) => log.message === "DKIM common selector check completed",
  );

  assert.equal(finding?.severity, "INFO");
  assert.equal(finding?.confidence, "LOW");
  assert.match(finding?.evidence ?? "", /DKIM may still exist/);
  assert.equal(dkimLogs.length, 1);
  assert.equal(dkimLogs[0]?.level, "INFO");
  assert.equal(dkimLogs[0]?.metadata?.status, "Not found for common selectors");
  assert.equal(
    result.findings.filter((item) => item.title.includes("DKIM")).length,
    1,
  );
});

test("DKIM found creates no negative finding", async () => {
  const result = await scanWithResolver(createResolver());

  assert.deepEqual(result.emailSecuritySummary.dkimSelectorsFound, ["default"]);
  assert.equal(
    result.findings.some((item) => item.title.includes("DKIM")),
    false,
  );
});
