/* A concept as its page and the Brain's card show it: loaded with what its text shows from elsewhere
 * (pictures, math, embeds), so it is drawn whole instead of growing as each part arrives. */
import { learn } from "../../api";
import { prepareMarkdown } from "../../components/markdownReady";

export async function loadConcept(id: string) {
  const concept = await learn.concept(id);
  await prepareMarkdown(`${concept.summary}\n\n${concept.body}`);
  return concept;
}
