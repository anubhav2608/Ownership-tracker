"use client";

import { Car, Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/** The submit button of the "Try the demo" form: shows it's working while the demo account is set up. */
export function DemoButton({ size = "lg" }: { size?: "default" | "lg" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size={size} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Car />}
      {pending ? "Setting up your demo…" : "Try the demo"}
    </Button>
  );
}
