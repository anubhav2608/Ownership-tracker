"use client";

import { useEffect } from "react";

/** Drops ?error= from the address once shown, so a reload doesn't repeat an old error. */
export function ClearErrorParam() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("error")) return;
    url.searchParams.delete("error");
    window.history.replaceState(window.history.state, "", url);
  }, []);
  return null;
}
