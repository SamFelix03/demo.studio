import type { Beat } from "@demo-studio/shared";

/** Exact string Kane should put in a field — never quoted, never the rest of the sentence. */
export function typedValueFromAction(action: string): string | undefined {
  const m = action.match(/\b(?:type|fill|enter)\s+(.+?)\s+into\b/i);
  if (!m) return undefined;
  return m[1].replace(/^["'`]+|["'`]+$/g, "").trim() || undefined;
}

export function requiredTools(action: string): Array<"click" | "type"> {
  const tools: Array<"click" | "type"> = [];
  if (/\b(type|fill|enter)\b/i.test(action)) tools.push("type");
  if (/\b(click|choose|select|save)\b/i.test(action)) tools.push("click");
  if (/\bcheck(\s|-)?box\b/i.test(action) || /\bhit the check/i.test(action)) tools.push("click");
  return [...new Set(tools)];
}

/** Click success must prove a page change, not text that was already on screen. */
export function tightenBeatGates(beats: Beat[]): Beat[] {
  return beats.map((b, i) => {
    const next = beats[i + 1];
    const success = { ...b.success };
    const blob = `${b.action} ${b.targetText ?? ""}`.toLowerCase();
    const label = (b.targetText ?? "").trim();
    const click = requiredTools(b.action).includes("click");
    if (click && label && success.visibleText && success.visibleText.toLowerCase() === label.toLowerCase()) {
      delete success.visibleText;
    }
    const typed = typedValueFromAction(b.action);
    if (typed) success.visibleText = typed;
    if (/create it free/i.test(blob)) {
      success.urlContains = success.urlContains || "/edit";
      if (!typed) success.visibleText = success.visibleText || "Description";
    }
    if (click && /feature/i.test(blob) && !success.urlContains) success.urlContains = "feature";
    if (click && /pric/i.test(blob) && !success.urlContains) success.urlContains = "pric";
    if (click && /contact/i.test(blob) && !success.urlContains) success.urlContains = "contact";
    if (click && next?.targetText && !success.visibleText && !success.urlContains) {
      success.visibleText = next.targetText;
    }
    return { ...b, success };
  });
}
