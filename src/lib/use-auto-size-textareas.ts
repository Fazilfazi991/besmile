"use client";
import { useLayoutEffect } from "react";

export function useAutoSizeTextareas(selector: string, values: readonly unknown[]) {
  useLayoutEffect(() => {
    const resize = (element: HTMLTextAreaElement) => { element.style.height = "auto"; element.style.height = `${Math.min(element.scrollHeight, 320)}px`; element.style.overflowY = element.scrollHeight > 320 ? "auto" : "hidden"; };
    const elements = [...document.querySelectorAll<HTMLTextAreaElement>(selector)];
    const onInput = (event: Event) => resize(event.currentTarget as HTMLTextAreaElement);
    elements.forEach(element => { resize(element); element.addEventListener("input", onInput); });
    return () => elements.forEach(element => element.removeEventListener("input", onInput));
  // Controlled values intentionally retrigger sizing when a form opens or changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, ...values]);
}
