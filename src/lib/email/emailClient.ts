import { randomUUID } from "crypto";
import net from "net";
import tls from "tls";

import type { EmailConfig } from "./emailConfig.ts";

export type EmailAddress = {
  email: string;
  name?: string | null;
};

export type EmailPayload = {
  from: EmailAddress;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
};

export type EmailClientResult =
  | {
      success: true;
      providerMessageId: string | null;
    }
  | {
      success: false;
      errorMessage: string;
    };

type SmtpResponse = {
  code: number;
  lines: string[];
  message: string;
};

type SmtpSocket = net.Socket | tls.TLSSocket;

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function escapeAddressName(value: string) {
  return sanitizeHeader(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatAddress(address: EmailAddress) {
  if (!address.name) {
    return `<${address.email}>`;
  }

  return `"${escapeAddressName(address.name)}" <${address.email}>`;
}

function normalizeBody(value: string) {
  return value.replace(/\r?\n/g, "\r\n");
}

function dotEscape(value: string) {
  return normalizeBody(value)
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

export function buildMimeMessage(payload: EmailPayload) {
  const boundary = `smb-email-${randomUUID()}`;
  const headers = [
    `From: ${formatAddress(payload.from)}`,
    `To: <${payload.to}>`,
    `Subject: ${sanitizeHeader(payload.subject)}`,
    "MIME-Version: 1.0",
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@smb-security-report-generator.local>`,
    payload.replyTo ? `Reply-To: <${sanitizeHeader(payload.replyTo)}>` : null,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);

  return [
    ...headers,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizeBody(payload.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizeBody(payload.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function readSmtpResponse(socket: SmtpSocket): Promise<SmtpResponse> {
  return new Promise((resolve, reject) => {
    let buffer = "";

    function cleanup() {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    }

    function onError(error: Error) {
      cleanup();
      reject(error);
    }

    function onClose() {
      cleanup();
      reject(new Error("SMTP connection closed unexpectedly."));
    }

    function onData(chunk: Buffer) {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const lastLine = lines.at(-1);

      if (!lastLine || !/^\d{3} /.test(lastLine)) {
        return;
      }

      cleanup();
      const code = Number(lastLine.slice(0, 3));

      resolve({
        code,
        lines,
        message: lines.map((line) => line.slice(4)).join("\n"),
      });
    }

    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);
  });
}

async function sendCommand(
  socket: SmtpSocket,
  command: string,
  expectedCodes: number[],
) {
  socket.write(`${command}\r\n`);
  const response = await readSmtpResponse(socket);

  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP command failed with ${response.code}: ${response.message}`);
  }

  return response;
}

function connectSmtp(config: Extract<EmailConfig, { provider: "smtp"; configured: true }>) {
  return new Promise<SmtpSocket>((resolve, reject) => {
    const socket = config.secure
      ? tls.connect({
          host: config.host,
          port: config.port,
          servername: config.host,
        })
      : net.createConnection({
          host: config.host,
          port: config.port,
        });

    socket.setTimeout(15000);
    if (config.secure) {
      socket.once("secureConnect", () => resolve(socket));
    } else {
      socket.once("connect", () => resolve(socket));
    }
    socket.once("error", reject);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("SMTP connection timed out."));
    });
  });
}

async function upgradeToTls(socket: SmtpSocket, host: string) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const secureSocket = tls.connect({
      servername: host,
      socket,
    });

    secureSocket.once("secureConnect", () => resolve(secureSocket));
    secureSocket.once("error", reject);
  });
}

function supportsStartTls(response: SmtpResponse) {
  return response.lines.some((line) => line.toUpperCase().includes("STARTTLS"));
}

async function sendViaSmtp(
  config: Extract<EmailConfig, { provider: "smtp"; configured: true }>,
  payload: EmailPayload,
): Promise<EmailClientResult> {
  let socket = await connectSmtp(config);

  try {
    await readSmtpResponse(socket);
    let ehloResponse = await sendCommand(socket, "EHLO localhost", [250]);

    if (!config.secure && supportsStartTls(ehloResponse)) {
      await sendCommand(socket, "STARTTLS", [220]);
      socket = await upgradeToTls(socket, config.host);
      ehloResponse = await sendCommand(socket, "EHLO localhost", [250]);
    }

    if (config.user && config.password) {
      const authValue = Buffer.from(`\0${config.user}\0${config.password}`).toString("base64");

      await sendCommand(socket, `AUTH PLAIN ${authValue}`, [235]);
    } else {
      void ehloResponse;
    }

    await sendCommand(socket, `MAIL FROM:<${config.fromEmail}>`, [250]);
    await sendCommand(socket, `RCPT TO:<${payload.to}>`, [250, 251]);
    await sendCommand(socket, "DATA", [354]);
    socket.write(`${dotEscape(buildMimeMessage(payload))}\r\n.\r\n`);
    const dataResponse = await readSmtpResponse(socket);

    if (dataResponse.code < 200 || dataResponse.code >= 300) {
      throw new Error(`SMTP data failed with ${dataResponse.code}: ${dataResponse.message}`);
    }
    await sendCommand(socket, "QUIT", [221]).catch(() => undefined);

    return {
      providerMessageId: null,
      success: true,
    };
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : "SMTP send failed.",
      success: false,
    };
  } finally {
    socket.destroy();
  }
}

export async function sendWithEmailClient(
  config: Extract<EmailConfig, { configured: true }>,
  payload: EmailPayload,
): Promise<EmailClientResult> {
  if (config.provider === "console") {
    const preview = [
      "[email:console]",
      `to=${payload.to}`,
      `subject=${payload.subject}`,
      `text=${payload.text.slice(0, 1200)}`,
    ].join("\n");

    console.info(preview);

    return {
      providerMessageId: `console:${randomUUID()}`,
      success: true,
    };
  }

  return sendViaSmtp(config, payload);
}
