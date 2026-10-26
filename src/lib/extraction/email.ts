import PostalMime from "postal-mime";

// Reading forwarded emails (spec §4A, §4C). The body is turned into text lines
// in the same shape the PDF reader produces, so the same parser reads both:
// table cells are separated by two spaces, block elements end a line.

const BLOCK = /<\/?(p|div|br|tr|li|ul|ol|table|tbody|thead|tfoot|h[1-6]|section|article|header|footer|blockquote|hr)\b[^>]*>/gi;
const CELL_END = /<\/(td|th)>/gi;

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rupee: "₹", copy: "©", reg: "®", trade: "™",
  zwnj: "", zwj: "", shy: "", lrm: "", rlm: "", ensp: " ", emsp: " ", thinsp: " ",
  ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", middot: "·",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Text lines from an HTML email body: one line per block or table row. */
export function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(head|style|script|title|noscript)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(CELL_END, "\u0001")
    .replace(BLOCK, "\n")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(text)
    .split("\n")
    .map((line) =>
      line
        .split("\u0001")
        .map((cell) => cell.replace(/[  ​-‍﻿]+/g, " ").trim())
        .filter(Boolean)
        .join("  "),
    )
    .filter(Boolean);
}

/** Text lines from a plain-text body. Quoted ("> ") forwards are unquoted. */
export function textToLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^(>\s?)+/, "").replace(/\t+/g, "  ").replace(/[  ]{3,}/g, "  ").trim())
    .filter(Boolean);
}

/** Prefers the HTML part (it keeps table columns); falls back to the text part. */
export function bodyLines(body: { html?: string | null; text?: string | null }): string[] {
  const fromHtml = body.html ? htmlToLines(body.html) : [];
  if (fromHtml.join("").length >= 20) return fromHtml;
  return body.text ? textToLines(body.text) : fromHtml;
}

/** "Name <a@b.com>" or "a@b.com" → "a@b.com" (lowercase), or null. */
export function emailAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/<([^<>\s]+@[^<>\s]+)>/) ?? value.match(/([^\s<>"',;]+@[^\s<>"',;]+)/);
  return match ? match[1].toLowerCase() : null;
}

/** Forwarding tokens among the recipients that belong to our inbound domain. */
export function forwardingTokens(recipients: (string | null | undefined)[], domain: string): string[] {
  const tokens = new Set<string>();
  for (const r of recipients) {
    const address = emailAddress(r);
    if (!address) continue;
    const [local, host] = address.split("@");
    // Allow plus-addressing (u_abc+anything@) but match the token exactly.
    const token = local.split("+")[0];
    if (host === domain.toLowerCase() && /^u_[0-9a-f]{16}$/.test(token)) tokens.add(token);
  }
  return [...tokens];
}

export interface ParsedEmail {
  from: string | null;
  /** The From header as written, with the display name. */
  fromHeader: string | null;
  to: string[];
  date: string | null;
  subject: string;
  messageId: string | null;
  html: string | null;
  text: string | null;
  attachments: { fileName: string; mimeType: string; content: Uint8Array }[];
  /** Header values by lowercase name (the first, when a header repeats). */
  headers: Record<string, string>;
}

/** Parses a raw RFC 822 message. Inline images (logos, signatures) are dropped. */
export async function parseRawEmail(raw: Uint8Array | string): Promise<ParsedEmail> {
  const email = await PostalMime.parse(raw, { attachmentEncoding: "arraybuffer" });
  const from = email.from && "address" in email.from ? (email.from.address ?? null) : null;
  const mailbox = email.from && "address" in email.from ? email.from : null;
  return {
    from: from?.toLowerCase() ?? null,
    fromHeader: mailbox?.address ? (mailbox.name ? `${mailbox.name} <${mailbox.address}>` : mailbox.address) : null,
    to: (email.to ?? []).flatMap((a) => (a.address ? [a.address] : (a.group ?? []).map((g) => g.address))),
    date: email.date ?? null,
    subject: email.subject?.trim() || "(no subject)",
    messageId: email.messageId ?? null,
    html: email.html ?? null,
    text: email.text ?? null,
    attachments: email.attachments
      .filter((a) => a.disposition !== "inline" && !a.related)
      .map((a, i) => ({
        fileName: a.filename || `attachment-${i + 1}`,
        mimeType: a.mimeType.toLowerCase(),
        content: typeof a.content === "string" ? new TextEncoder().encode(a.content) : new Uint8Array(a.content),
      })),
    headers: Object.fromEntries(
      [...email.headers].reverse().map((h) => [h.key.toLowerCase(), h.value] as const),
    ),
  };
}

/**
 * Who forwarded this email automatically, if anyone: Gmail's forwarding adds
 * "X-Forwarded-For: you@gmail.com <forwarding address>"; others "Resent-From".
 */
export function forwardedBy(headers: Record<string, string> | null | undefined): string | null {
  if (!headers) return null;
  const get = (name: string) => Object.entries(headers).find(([k]) => k.toLowerCase() === name)?.[1];
  const value = get("x-forwarded-for") ?? get("resent-from");
  return emailAddress(value);
}

const GMAIL_CONFIRM_FROM = "forwarding-noreply@google.com";
/** Google's confirmation links, and nothing else, are shown to the user. */
const GMAIL_CONFIRM_LINK = /https:\/\/(mail-settings|mail)\.google\.com\/[^\s"'<>]+/;

/**
 * Gmail's "Forwarding Confirmation" email, sent to a forwarding address before
 * Gmail forwards anything to it: who asked, the code to enter in Gmail, and
 * the link that confirms it instead.
 */
export function gmailForwardingConfirmation(m: {
  from: string | null;
  subject: string;
  text?: string | null;
  html?: string | null;
  headers?: Record<string, string> | null;
}): { gmail: string; code: string; link: string | null } | null {
  if (emailAddress(m.from) !== GMAIL_CONFIRM_FROM) return null;
  if (!/forwarding confirmation/i.test(m.subject)) return null;
  // A spoofed "Google" email that the receiving server saw fail DKIM is ignored.
  const auth = Object.entries(m.headers ?? {}).find(([k]) => k.toLowerCase() === "authentication-results")?.[1];
  if (auth && /\bdkim=fail\b/i.test(auth)) return null;
  const body = m.text || (m.html ? htmlToLines(m.html).join("\n") : "");
  const gmail = emailAddress(m.subject.match(/receive mail from\s+(\S+@\S+)/i)?.[1]) ??
    emailAddress(body.match(/(\S+@\S+)\s+has requested to automatically forward/i)?.[1]);
  const code = m.subject.match(/\(#(\d{6,12})\)/)?.[1] ?? body.match(/confirmation code:?\s*(\d{6,12})/i)?.[1];
  if (!gmail || !code) return null;
  const link = (m.text ?? "").match(GMAIL_CONFIRM_LINK)?.[0] ?? (m.html ?? "").match(GMAIL_CONFIRM_LINK)?.[0] ?? null;
  return { gmail, code, link: link?.replace(/&amp;/g, "&") ?? null };
}

/**
 * The message without its attachments, as a small RFC 822 file. It is stored
 * as the email's document (attachments are stored separately), so it can be
 * opened later and read again.
 */
export function bodyOnlyEmail(m: {
  from: string;
  to: string[];
  subject: string;
  date: string;
  messageId?: string | null;
  html?: string | null;
  text?: string | null;
}): string {
  const encodeHeader = (v: string) =>
    /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
  const b64 = (v: string) => Buffer.from(v, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
  const clean = (v: string) => v.replace(/[\r\n]+/g, " ");
  const boundary = `b_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${clean(m.from)}`,
    `To: ${clean(m.to.join(", "))}`,
    `Subject: ${encodeHeader(clean(m.subject))}`,
    `Date: ${new Date(m.date).toUTCString()}`,
    ...(m.messageId ? [`Message-ID: ${clean(m.messageId)}`] : []),
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const parts = [
    ...(m.text ? [["text/plain", m.text]] : []),
    ...(m.html ? [["text/html", m.html]] : []),
  ].map(
    ([type, body]) =>
      `--${boundary}\r\nContent-Type: ${type}; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(body)}\r\n`,
  );
  return `${headers.join("\r\n")}\r\n\r\n${parts.join("")}--${boundary}--\r\n`;
}
