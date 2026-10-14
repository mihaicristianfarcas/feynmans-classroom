/* Settings: who you are, which subscription does the thinking (Codex or Claude Code), the models and
 * effort for quick and careful work (folded away until wanted), and the vault's folder and history. */
import { useState } from "react";
import { learn, type SettingsInfo } from "../api";
import { Spinner } from "../components/feedback";
import { ProfileForm } from "../components/ProfileForm";
import { timeAgo } from "../lib/time";
import { useLoad } from "../lib/useLoad";

export function Settings() {
  const { data: info, reload } = useLoad(() => learn.settings());
  const { data: profile, setData: setProfile } = useLoad(() => learn.profile());
  const { data: vault } = useLoad(() => learn.vault());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  if (!info || !profile)
    return (
      <div className="center-note">
        <Spinner label="Opening settings" />
      </div>
    );
  const s = info.settings;
  const save = async (patch: Partial<SettingsInfo["settings"]>) => {
    await learn.saveSettings(patch);
    reload();
    setSaved("Saved");
    setTimeout(() => setSaved(null), 1600);
  };
  const tier = (provider: "codex" | "claude") => {
    const t = s[provider];
    const field = (key: keyof typeof t, label: string, placeholder: string) => (
      <label className="field">
        <span>{label}</span>
        <input
          defaultValue={t[key]}
          placeholder={placeholder}
          onBlur={(e) =>
            e.target.value !== t[key] &&
            save({ [provider]: { ...t, [key]: e.target.value } } as Partial<SettingsInfo["settings"]>)
          }
        />
      </label>
    );
    return (
      <div className="form-row four">
        {field("fastModel", "Quick model", provider === "codex" ? "e.g. gpt-6-luna" : "e.g. sonnet")}
        {field("fastEffort", "Quick effort", "low")}
        {field("smartModel", "Careful model", provider === "codex" ? "(your Codex default)" : "e.g. opus")}
        {field("smartEffort", "Careful effort", "medium")}
      </div>
    );
  };
  return (
    <div className="settings rise">
      <header className="page-head row">
        <h1 className="page-title">Settings</h1>
        {saved && (
          <span className="saved" role="status">
            {saved}
          </span>
        )}
      </header>

      <section className="settings-section">
        <h2 className="section-title">Who does the thinking</h2>
        <p className="fine">Your own subscription, through its command-line tool. No API keys.</p>
        <div className="providers">
          {(["auto", "codex", "claude"] as const).map((p) => (
            <label key={p} className="provider" data-on={s.provider === p || undefined}>
              <input type="radio" name="provider" checked={s.provider === p} onChange={() => save({ provider: p })} />
              <span className="provider-name">
                {p === "auto" ? "Automatic" : p === "codex" ? "Codex" : "Claude Code"}
              </span>
              <span className="provider-status">
                {p === "auto" && `uses ${info.active === "codex" ? "Codex" : "Claude Code"} now`}
                {p === "codex" &&
                  (info.codex.installed
                    ? info.codex.loggedIn
                      ? `${info.codex.version} · logged in`
                      : "installed, not logged in: run codex login"
                    : "not installed: npm i -g @openai/codex")}
                {p === "claude" &&
                  (info.claude.installed
                    ? `${info.claude.version}`
                    : "not installed: npm i -g @anthropic-ai/claude-code")}
              </span>
            </label>
          ))}
        </div>
        <details className="disclosure">
          <summary>Models and speed</summary>
          <h3 className="sub-title">Codex models</h3>
          {tier("codex")}
          <h3 className="sub-title">Claude Code models</h3>
          {tier("claude")}
          <div className="form-row two">
            <label className="field">
              <span>Model calls at once</span>
              <input
                type="number"
                min={1}
                max={8}
                defaultValue={s.concurrency}
                onBlur={(e) => save({ concurrency: Number(e.target.value) })}
              />
            </label>
            <p className="fine">
              Quick: figures, cards, quizzes, grading (seconds). Careful: chapter planning, asking the vault, “careful”
              figures. Now running {info.load.running}, waiting {info.load.waiting}.
            </p>
          </div>
        </details>
      </section>

      <section className="settings-section">
        <h2 className="section-title">Agents in your vault</h2>
        <p className="fine">
          Agents read only your vault, have no network, and make their changes on their own branch, as one commit you
          can undo.
        </p>
        <div className="radio-row" role="radiogroup" aria-label="Connections between notes">
          <label className="check">
            <input
              type="radio"
              name="connections"
              checked={(s.connections || "suggest") === "suggest"}
              onChange={() => save({ connections: "suggest" })}
            />
            Suggest connections between notes; I accept or reject each
          </label>
          <label className="check">
            <input
              type="radio"
              name="connections"
              checked={s.connections === "auto"}
              onChange={() => save({ connections: "auto" })}
            />
            Add them straight away (marked AI); I remove the ones I don't want
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="section-title">You</h2>
        <ProfileForm
          initial={profile}
          saving={saving}
          onSave={async (p) => {
            setSaving(true);
            setProfile(await learn.saveProfile({ ...p, onboarded: true }));
            setSaving(false);
            setSaved("Profile saved");
            setTimeout(() => setSaved(null), 1600);
          }}
        />
      </section>

      {vault && (
        <section className="settings-section">
          <h2 className="section-title">Your vault</h2>
          <p className="fine">
            Plain Markdown in <code>{vault.path}</code>: {vault.notes} notes, {vault.concepts} concepts, {vault.cards}{" "}
            cards, {vault.figures} figures. Open it in any editor or Obsidian. Jujutsu (jj) keeps every version, and
            each agent request can be undone.
          </p>
          {vault.history.length > 0 && (
            <ul className="history">
              {vault.history.slice(0, 6).map((h) => (
                <li key={h.commit}>
                  <code>{h.change.slice(0, 8)}</code> <span>{h.subject}</span>{" "}
                  <span className="muted">{timeAgo(h.when)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
