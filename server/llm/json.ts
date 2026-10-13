/* Reading JSON out of a model's answer, which is sometimes wrapped in a code fence or prose. */

/** Parses `text` as JSON, else the first fenced block, else the outermost {…}. Throws if none parses. */
export function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    return JSON.parse(body);
  }
}
