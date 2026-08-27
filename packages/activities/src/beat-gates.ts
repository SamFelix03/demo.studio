import type { Beat, BeatSuccess } from "@demo-studio/shared";

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

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function overlaps(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  if (shorter.length >= 12 && longer.includes(shorter)) return true;
  const words = shorter.split(" ").filter((w) => w.length > 2);
  if (words.length >= 3 && longer.includes(shorter)) return true;
  return false;
}

/** Visible label of the control this action clicks, not destination UI. */
export function clickControlLabel(action: string, targetText?: string): string | undefined {
  const labeled = action.match(/labeled\s+["']?([^"'.]+?)["']?(?:\s*[.,]|$)/i)?.[1];
  if (labeled) return labeled.replace(/^(the\s+)?button\s+/i, "").trim();
  const click = action.match(
    /\b(?:click(?:\s+on)?|choose|select|open)\s+(?:the\s+)?(?:button\s+)?(?:labeled\s+)?(.+?)(?:\s+then\b|$)/i,
  )?.[1];
  const fromAction = click?.replace(/^(the|a|an)\s+/i, "").replace(/^(button\s+labeled\s+)/i, "").trim();
  const t = (targetText || fromAction || "").replace(/^(the\s+)?button\s+labeled\s+/i, "").trim();
  return t || undefined;
}

function looksLikeLabel(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 48) return false;
  if (/^(click|type|open|choose|select|fill|enter|hit)\b/i.test(t)) return false;
  return true;
}

export function fieldLabelFromAction(action: string): string | undefined {
  const into = action.match(/\binto\s+(?:the\s+)?(.+?)(?:\s+text\s+box|\s+field|,|\s+then|$)/i);
  if (into) return into[1].replace(/^(the|a|an)\s+/i, "").trim();
  const under = action.match(/\bunder\s+(?:the\s+(?:heading\s+)?)?(.+)$/i);
  if (under) return under[1].replace(/[.,]+$/, "").trim();
  const dropdown = action.match(/\b(?:open|from)\s+(?:the\s+)?(.+?)\s+dropdown/i);
  if (dropdown) return dropdown[1].trim();
  return undefined;
}

/** True when `text` is the control we clicked, not proof the destination loaded. */
export function isControlResidue(text: string, beat: Beat): boolean {
  if (!text.trim()) return false;
  const typed = typedValueFromAction(beat.action);
  if (typed && norm(text) === norm(typed)) return false;
  const chosen = beat.action.match(/\bchoose\s+(.+)$/i)?.[1]?.replace(/[.,]+$/, "").trim();
  if (chosen && overlaps(text, chosen)) return false;
  if (!requiredTools(beat.action).includes("click")) return false;
  if (/^(the\s+)?(button|link|control|dropdown)\s+labeled\b/i.test(text)) return true;
  const label = clickControlLabel(beat.action, looksLikeLabel(beat.targetText || "") ? beat.targetText : undefined);
  if (label && overlaps(text, label)) return true;
  if (beat.targetText && looksLikeLabel(beat.targetText) && overlaps(text, beat.targetText)) return true;
  return false;
}

function cleanTarget(beat: Beat): string | undefined {
  const fromAction = clickControlLabel(
    beat.action,
    looksLikeLabel(beat.targetText || "") ? beat.targetText : undefined,
  );
  if (fromAction && looksLikeLabel(fromAction)) return fromAction;
  const raw = (beat.targetText || "").replace(/^(the\s+)?button\s+labeled\s+/i, "").trim();
  if (looksLikeLabel(raw)) return raw;
  return fromAction || beat.targetText;
}

function destinationFromNext(beat: Beat, next: Beat | undefined): string | undefined {
  if (!next) return undefined;
  const field = fieldLabelFromAction(next.action);
  if (field && looksLikeLabel(field) && !isControlResidue(field, beat)) return field;
  const dropdown = next.action.match(/\b(?:open|from)\s+(?:the\s+)?(.+?)\s+dropdown/i)?.[1];
  if (dropdown && !isControlResidue(dropdown, beat)) return dropdown.trim();
  const choose = next.action.match(/\bchoose\s+(.+)$/i)?.[1];
  if (choose && looksLikeLabel(choose) && !isControlResidue(choose, beat)) {
    return choose.replace(/[.,]+$/, "").trim();
  }
  const nextClick = clickControlLabel(
    next.action,
    looksLikeLabel(next.targetText || "") ? next.targetText : undefined,
  );
  if (nextClick && looksLikeLabel(nextClick) && !isControlResidue(nextClick, beat)) return nextClick;
  if (next.targetText && looksLikeLabel(next.targetText) && !isControlResidue(next.targetText, beat)) {
    return next.targetText;
  }
  return undefined;
}

function destinationSuccess(beat: Beat, next: Beat | undefined): BeatSuccess {
  const success: BeatSuccess = { ...beat.success };
  const typed = typedValueFromAction(beat.action);
  if (typed) {
    success.visibleText = typed;
    return success;
  }
  const click = requiredTools(beat.action).includes("click");
  if (
    click &&
    success.visibleText &&
    (isControlResidue(success.visibleText, beat) || /^(click|type|open|choose|select|fill|enter|hit)\b/i.test(success.visibleText))
  ) {
    delete success.visibleText;
  }
  if (click && !success.visibleText && !success.urlContains && !success.titleContains && !success.headingContains) {
    const dest = destinationFromNext(beat, next);
    if (dest) success.visibleText = dest.split(" ").slice(0, 6).join(" ");
  }
  if (success.visibleText && click && isControlResidue(success.visibleText, beat)) {
    delete success.visibleText;
  }
  const blob = `${beat.action} ${beat.targetText ?? ""}`.toLowerCase();
  if (click && !success.visibleText && !success.urlContains) {
    if (/feature/i.test(blob)) success.urlContains = "feature";
    else if (/pric/i.test(blob)) success.urlContains = "pric";
    else if (/contact/i.test(blob)) success.urlContains = "contact";
  }
  return success;
}

/**
 * Click success must prove the destination, never the label of the control just clicked.
 * Type success is the value typed. Next-step field/label is the default destination cue.
 */
export function tightenBeatGates(beats: Beat[]): Beat[] {
  return beats.map((b, i) => {
    const targetText = cleanTarget(b);
    const withTarget = { ...b, targetText };
    return { ...withTarget, success: destinationSuccess(withTarget, beats[i + 1]) };
  });
}

/** Spoken line when Gemini is unavailable — describe the screen after the action. */
export function hostNarration(beat: Beat, next?: Beat): string {
  const typed = typedValueFromAction(beat.action);
  if (typed) return `${typed} is what now sits on this screen.`;
  const dest = destinationFromNext(beat, next);
  if (dest) return `${dest} is on screen after this step.`;
  const label = clickControlLabel(beat.action, looksLikeLabel(beat.targetText || "") ? beat.targetText : undefined);
  if (label && looksLikeLabel(label)) return `The page after ${label} is the one the viewer should see.`;
  return (beat.narration || beat.action).replace(/\s+/g, " ").trim().slice(0, 180);
}
