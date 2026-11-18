"use client";

import { useEffect, useRef } from "react";
import { startDemo } from "@/app/demo/actions";
import { DemoButton } from "@/components/demo-button";

/**
 * The "Try the demo" form, submitted as soon as the page opens in a browser, so a
 * shared link (/demo) takes a visitor straight into the sample records. Link
 * previewers don't run scripts, so they don't create demo accounts; the button
 * stays as the fallback when scripts are off.
 */
export function DemoAutostart() {
  const form = useRef<HTMLFormElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    form.current?.requestSubmit();
  }, []);

  return (
    <form ref={form} action={startDemo}>
      <DemoButton />
    </form>
  );
}
