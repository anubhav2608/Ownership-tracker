"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Copies text: the clipboard API where it's allowed, else the older way through
 * a hidden text box (which some browsers still allow). False if neither worked.
 */
export async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const box = document.createElement("textarea");
    box.value = value;
    box.setAttribute("readonly", "");
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      box.remove();
    }
  }
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (await copyText(value)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      // Some in-app browsers (opened from Gmail or WhatsApp) block copying entirely.
      toast.error("Couldn't copy here. Press and hold the text to select and copy it.");
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
