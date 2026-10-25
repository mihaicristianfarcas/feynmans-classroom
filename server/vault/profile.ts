/* The learner's profile (profile.md): goals, background, level and how they like to learn, as
 * frontmatter, with their own notes as the body. Every prompt that adapts to the learner reads it. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Profile } from "../../shared/vault-types.ts";
import { wroteItself } from "./changes.ts";
import { vaultDir } from "./current.ts";
import { asArray, atomicWrite, parseFrontmatter, stringifyFrontmatter } from "./files.ts";
import { changed } from "./jj.ts";

export const DEFAULT_PROFILE: Profile = {
  name: "",
  role: "curious",
  goals: "",
  background: "",
  level: "intermediate",
  styles: { visual: 0.6, reader: 0.5, doer: 0.6 },
  interests: [],
  dailyNew: 20,
  retention: 0.9,
  notes: "",
  onboarded: false,
};

export function getProfile(): Profile {
  const path = join(vaultDir(), "profile.md");
  if (!existsSync(path)) return { ...DEFAULT_PROFILE };
  const { data, body } = parseFrontmatter(readFileSync(path, "utf8"));
  const styles = (data.styles || {}) as Partial<Profile["styles"]>;
  return {
    ...DEFAULT_PROFILE,
    ...(data as Partial<Profile>),
    styles: { ...DEFAULT_PROFILE.styles, ...styles },
    interests: asArray(data.interests),
    notes: body.trim(),
  };
}

export function saveProfile(patch: Partial<Profile>): Profile {
  const next = { ...getProfile(), ...patch };
  next.styles = { ...getProfile().styles, ...(patch.styles || {}) };
  next.retention = Math.min(0.97, Math.max(0.7, Number(next.retention) || 0.9));
  next.dailyNew = Math.max(0, Math.min(200, Math.round(Number(next.dailyNew) || 20)));
  const { notes: body, ...data } = next;
  wroteItself("profile.md");
  atomicWrite(
    join(vaultDir(), "profile.md"),
    stringifyFrontmatter(
      data as unknown as Record<string, unknown>,
      body || "_Anything about how you learn best: write it here, and the tutor will read it._",
    ),
  );
  changed("profile");
  return next;
}
