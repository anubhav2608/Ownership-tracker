"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (e.g. insecure context); the address is still visible to copy by hand.
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={copy}>
      {copied ? <Check className="size-4 text-accent" /> : <Copy className="size-4" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
