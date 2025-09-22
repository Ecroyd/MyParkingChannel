"use client";
import { useEffect } from "react";

export default function WidgetResizer() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const send = () => {
      const height = document.documentElement.scrollHeight || document.body.scrollHeight || 500;
      window.parent?.postMessage({ type: "pc:widget-height", height }, "*");
    };
    send();
    const ro = new ResizeObserver(() => send());
    ro.observe(document.body);
    const onLoad = () => send();
    window.addEventListener("load", onLoad);
    return () => {
      ro.disconnect();
      window.removeEventListener("load", onLoad);
    };
  }, []);
  return null;
}
