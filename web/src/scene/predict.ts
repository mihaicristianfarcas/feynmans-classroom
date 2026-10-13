/* "Predict first": a question shown over a figure before it plays. Choosing an answer marks it right
 * or wrong and explains; "Watch it" (or Skip) closes the question and the figure plays. It sits inside
 * the figure rather than in a dialog, so it doesn't take focus when the figure scrolls into view. */
import type { Predict } from "../../../shared/scene/types.ts";
import { h } from "./dom";

/** The question's box; it removes itself on close (`hadFocus`: focus was inside it, so put it back somewhere). */
export function predictBox(
  p: Predict,
  { onAnswer, onClose }: { onAnswer: (correct: boolean) => void; onClose: (hadFocus: boolean) => void },
): HTMLElement {
  const skip = h("button", { class: "sc-link", type: "button", text: "Skip" });
  const choices = p.choices.map((c, i) => {
    const b = h("button", { class: "sc-btn", type: "button", text: c }) as HTMLButtonElement;
    b.addEventListener("click", () => reveal(i));
    return b;
  });
  const box = h("div", { class: "sc-predict", role: "group", "aria-label": "Predict first" }, [
    h("div", { class: "sc-predict-head" }, [h("span", { text: "Predict first" }), skip]),
    h("p", { text: p.question }),
    h("div", { class: "sc-predict-choices" }, choices),
  ]);
  const close = () => {
    const hadFocus = box.contains(document.activeElement);
    box.remove();
    onClose(hadFocus);
  };
  skip.addEventListener("click", close);
  const reveal = (i: number) => {
    const right = i === p.answer;
    choices.forEach((b, k) => {
      b.disabled = true;
      if (k === p.answer) b.dataset.right = "";
      if (k === i && !right) b.dataset.wrong = "";
    });
    const watch = h("button", { class: "sc-btn", type: "button", text: "Watch it" });
    watch.addEventListener("click", close);
    box.append(
      h("p", { class: "sc-answer", role: "status", text: `${right ? "Right." : "Not quite."} ${p.explain}` }),
      h("div", {}, [watch]),
    );
    // the choices are disabled now: focus moves on to what comes next
    if (box.contains(document.activeElement) || document.activeElement === document.body) watch.focus();
    onAnswer(right);
  };
  return box;
}
