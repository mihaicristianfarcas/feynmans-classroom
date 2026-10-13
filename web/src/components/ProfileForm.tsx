/* The learner's profile form (used on the Welcome page and in Settings). */
import { useState } from "react";
import type { Profile } from "../api";

const STYLE_HELP = {
  visual: "Pictures, diagrams and animation",
  reader: "Careful prose, definitions, narration",
  doer: "Sliders, dragging, predicting, breaking things",
};

/** Who the learner is and how they like to learn. Everything the tutor and the figures adapt to. */
export function ProfileForm({
  initial,
  onSave,
  saving,
  submitLabel = "Save",
}: {
  initial: Profile;
  onSave: (p: Profile) => void;
  saving?: boolean;
  submitLabel?: string;
}) {
  const [p, setP] = useState<Profile>(initial);
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setP((old) => ({ ...old, [key]: value }));
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(p);
      }}
    >
      <div className="form-row two">
        <label className="field">
          <span>Your name</span>
          <input
            value={p.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="What should the tutor call you?"
          />
        </label>
        <label className="field">
          <span>You are a</span>
          <select value={p.role} onChange={(e) => set("role", e.target.value as Profile["role"])}>
            <option value="student">Student</option>
            <option value="professor">Professor or teacher</option>
            <option value="professional">Professional</option>
            <option value="curious">Curious learner</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>What do you want to learn, and why?</span>
        <textarea
          rows={3}
          value={p.goals}
          onChange={(e) => set("goals", e.target.value)}
          placeholder="e.g. Engineer software systems; specialise in agentic infrastructure and distributed systems. Understand how markets today map to Adam Smith's principles."
        />
      </label>
      <label className="field">
        <span>Your background</span>
        <textarea
          rows={2}
          value={p.background}
          onChange={(e) => set("background", e.target.value)}
          placeholder="e.g. Software engineer, 6 years of backend work; comfortable with calculus, rusty on statistics."
        />
      </label>
      <div className="form-row two">
        <label className="field">
          <span>Level in what you're studying</span>
          <select value={p.level} onChange={(e) => set("level", e.target.value as Profile["level"])}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
            <option value="expert">Expert</option>
          </select>
        </label>
        <label className="field">
          <span>Interests (comma separated)</span>
          <input
            value={p.interests.join(", ")}
            onChange={(e) =>
              set(
                "interests",
                e.target.value
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              )
            }
            placeholder="distributed systems, AI agents, economics"
          />
        </label>
      </div>
      <fieldset className="styles">
        <legend>How do you like to learn?</legend>
        <p className="fine">Figures, the tutor and quizzes adapt to this. Most people are a mix.</p>
        {(Object.keys(STYLE_HELP) as (keyof Profile["styles"])[]).map((key) => (
          <label key={key} className="style-row">
            <span className="style-name">{key === "visual" ? "Seeing" : key === "reader" ? "Reading" : "Doing"}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={p.styles[key]}
              onChange={(e) => set("styles", { ...p.styles, [key]: Number(e.target.value) })}
            />
            <span className="style-help">{STYLE_HELP[key]}</span>
          </label>
        ))}
      </fieldset>
      <div className="form-row two">
        <label className="field">
          <span>New flashcards per day</span>
          <input
            type="number"
            min={0}
            max={200}
            value={p.dailyNew}
            onChange={(e) => set("dailyNew", Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>Target recall ({Math.round(p.retention * 100)}%)</span>
          <input
            type="range"
            min={0.8}
            max={0.95}
            step={0.01}
            value={p.retention}
            onChange={(e) => set("retention", Number(e.target.value))}
          />
        </label>
      </div>
      <label className="field">
        <span>Anything else about how you learn</span>
        <textarea
          rows={2}
          value={p.notes.startsWith("_Anything") ? "" : p.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="e.g. I understand things best through concrete systems I've worked on. Don't over-explain the basics."
        />
      </label>
      <div className="form-actions">
        <button className="button primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
