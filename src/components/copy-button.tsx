"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

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
    <Button type="button" variant="outline" onClick={copy}>
      {copied ? <Check className="text-success" /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export function ForwardingAddress({ address }: { address: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-sm">
        {address}
      </code>
      <CopyButton value={address} label="Copy address" />
    </div>
  );
}
