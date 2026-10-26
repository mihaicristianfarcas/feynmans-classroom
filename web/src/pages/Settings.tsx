/* Settings: how the app looks and how you like to read (the theme, and the typeface, size and line
 * width of what you read, kept on this device), which subscription does the thinking (Codex, Claude
 * Code or OpenCode), the models and effort for quick and careful work (folded away until wanted, with
 * OpenCode's models to pick from once unfolded), what agents may do, who you are, and your vaults
 * (open, make, rename or delete one), with the open one's folder and history. Each section says what it is for over its controls; the list at the left (across the top on
 * a phone) marks the one you're in and goes to any of them (#/settings/<section> opens there). */
import { Bot, Cpu, FolderGit2, type LucideIcon, Palette, User } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { learn, type Provider, type SettingsInfo } from "../api";
import { PROVIDER_NAMES } from "../app/provider";
import { DEFAULT_READING, type Reading, savedReading, saveReading } from "../app/reading";
import { type ThemeChoice, themeChoice } from "../app/theme";
import { Loading } from "../components/feedback";
import { ProfileForm } from "../components/ProfileForm";
import { useIndicator } from "../components/ui";
import { announce } from "../lib/a11y";
import { timeAgo } from "../lib/time";
import { useLoad } from "../lib/useLoad";
import { VaultList } from "../vaults/VaultList";

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "thinking", label: "Thinking", icon: Cpu },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "you", label: "You", icon: User },
  { id: "vault", label: "Vaults", icon: FolderGit2 },
];
/** The section the address names (#/settings/you), if any. */
const sectionOf = (hash: string) => {
  const id = hash.split("?")[0].split("/")[2] || "";
  return SECTIONS.some((s) => s.id === id) ? id : null;
};

/** A section: its title and what it is for, over its controls. */
function Section({
  anchor,
  title,
  about,
  children,
}: {
  anchor: string;
  title: string;
  about?: ReactNode;
  children: ReactNode;
}) {
  const id = `settings-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section className="settings-section" id={`section-${anchor}`} data-section={anchor} aria-labelledby={id}>
      <div className="settings-intro">
        <h2 className="section-title" id={id} tabIndex={-1}>
          {title}
        </h2>
        {about && <p className="fine">{about}</p>}
      </div>
      <div className="settings-body">{children}</div>
    </section>
  );
}

/** One setting with a few choices, as a segmented control (the current one on the sliding tile). */
function Choice<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  const ref = useIndicator<HTMLFieldSetElement>(value);
  return (
    <div className="setting">
      <span className="setting-name" aria-hidden="true">
        {name}
      </span>
      <fieldset className="segmented" ref={ref}>
        <legend className="visually-hidden">{name}</legend>
        {options.map(([option, label]) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => {
              onChange(option);
              announce(`${name}: ${label}`);
            }}
          >
            {label}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

/** The theme and how you read: applied at once and kept on this device. */
function Appearance({ theme, setTheme }: { theme: "light" | "dark"; setTheme: (t: ThemeChoice) => void }) {
  const [choice, setChoice] = useState<ThemeChoice>(themeChoice);
  // the switch in the top bar picks a theme too
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again whenever the theme changes
  useEffect(() => setChoice(themeChoice()), [theme]);
  const [reading, setReading] = useState<Reading>(savedReading);
  const read = (patch: Partial<Reading>) => {
    const next = { ...reading, ...patch };
    setReading(next);
    saveReading(next);
  };
  return (
    <Section
      anchor="appearance"
      title="Appearance"
      about="How the app looks, and how books, notes and answers read. Kept on this device."
    >
      <Choice<ThemeChoice>
        name="Theme"
        value={choice}
        options={[
          ["system", "System"],
          ["light", "Light"],
          ["dark", "Dark"],
        ]}
        onChange={(t) => {
          setChoice(t);
          setTheme(t);
        }}
      />
      <Choice<Reading["font"]>
        name="Reading typeface"
        value={reading.font}
        options={[
          ["serif", "Serif"],
          ["sans", "Sans"],
        ]}
        onChange={(font) => read({ font })}
      />
      <Choice<Reading["size"]>
        name="Text size"
        value={reading.size}
        options={[
          ["small", "Small"],
          ["medium", "Medium"],
          ["large", "Large"],
          ["larger", "Larger"],
        ]}
        onChange={(size) => read({ size })}
      />
      <Choice<Reading["width"]>
        name="Line width"
        value={reading.width}
        options={[
          ["narrow", "Narrow"],
          ["medium", "Medium"],
          ["wide", "Wide"],
        ]}
        onChange={(width) => read({ width })}
      />
      <p className="reading-sample">
        A passage from your books, a note or an answer in the margin reads like this, in the typeface, size and line
        width you choose.
      </p>
      {(reading.font !== DEFAULT_READING.font ||
        reading.size !== DEFAULT_READING.size ||
        reading.width !== DEFAULT_READING.width) && (
        <button
          type="button"
          className="link"
          onClick={() => {
            read(DEFAULT_READING);
            announce("Reading set back to the defaults");
          }}
        >
          Back to the defaults
        </button>
      )}
    </Section>
  );
}

export function Settings({ theme, setTheme }: { theme: "light" | "dark"; setTheme: (t: ThemeChoice) => void }) {
  const { data: info, reload } = useLoad(() => learn.settings(), [], "settings");
  const { data: profile, setData: setProfile } = useLoad(() => learn.profile(), [], "profile");
  const { data: vault } = useLoad(() => learn.vault(), [], "vault");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  // the models OpenCode offers, listed once the models are unfolded
  const [opencodeModels, setOpencodeModels] = useState<string[]>([]);
  const askedModels = useRef(false);
  // the section in view, marked in the list as you scroll
  const [active, setActive] = useState(SECTIONS[0].id);
  const content = useRef<HTMLDivElement>(null);
  const ready = !!info && !!profile;
  useEffect(() => {
    if (!ready) return;
    // going to a section: the address names it (on opening, and from the list)
    const go = () => {
      const id = sectionOf(location.hash);
      const target = id && document.getElementById(`section-${id}`);
      if (!target) return;
      target.scrollIntoView({ block: "start" });
      target.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
      setActive(id);
    };
    go();
    window.addEventListener("hashchange", go);
    // the one in view: the last whose top has passed the upper third of the window
    const seen = new Map<string, boolean>();
    const spy = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set((e.target as HTMLElement).dataset.section!, e.isIntersecting);
        const first = SECTIONS.find((s) => seen.get(s.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const el of content.current?.querySelectorAll("[data-section]") || []) spy.observe(el);
    return () => {
      window.removeEventListener("hashchange", go);
      spy.disconnect();
    };
  }, [ready]);
  // across the top (a phone), the list keeps the marked section in view
  const nav = useRef<HTMLElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: again whenever another section is marked
  useEffect(() => {
    const strip = nav.current;
    const link = strip?.querySelector<HTMLElement>("[aria-current]");
    if (!strip || !link || strip.scrollWidth <= strip.clientWidth) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    strip.scrollTo({
      left: link.offsetLeft - (strip.clientWidth - link.offsetWidth) / 2,
      behavior: still ? "auto" : "smooth",
    });
  }, [active]);
  if (!info || !profile) return <Loading label="Opening settings" />;
  const s = info.settings;
  const save = async (patch: Partial<SettingsInfo["settings"]>) => {
    await learn.saveSettings(patch);
    reload();
    setSaved("Saved");
    setTimeout(() => setSaved(null), 1600);
  };
  const listModels = () => {
    if (askedModels.current || !info.opencode.installed) return;
    askedModels.current = true;
    learn.opencodeModels().then(
      (r) => setOpencodeModels(r.models),
      () => {},
    );
  };
  const placeholders: Record<Provider, [string, string]> = {
    codex: ["e.g. gpt-6-luna", "(your Codex default)"],
    claude: ["e.g. sonnet", "e.g. opus"],
    opencode: ["provider/model", "(your OpenCode default)"],
  };
  const tier = (provider: Provider) => {
    const t = s[provider];
    const field = (key: keyof typeof t, label: string, placeholder: string) => (
      <label className="field">
        <span>{label}</span>
        <input
          defaultValue={t[key]}
          placeholder={placeholder}
          list={provider === "opencode" && key.endsWith("Model") ? "opencode-models" : undefined}
          onBlur={(e) =>
            e.target.value !== t[key] &&
            save({ [provider]: { ...t, [key]: e.target.value } } as Partial<SettingsInfo["settings"]>)
          }
        />
      </label>
    );
    return (
      <div className="form-row four">
        {field("fastModel", "Quick model", placeholders[provider][0])}
        {field("fastEffort", "Quick effort", "low")}
        {field("smartModel", "Careful model", placeholders[provider][1])}
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

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Sections" ref={nav}>
          <ul>
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <a href={`#/settings/${id}`} aria-current={active === id ? "location" : undefined}>
                  <Icon aria-hidden="true" />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="settings-content" ref={content}>
          <Appearance theme={theme} setTheme={setTheme} />

          <Section
            anchor="thinking"
            title="Who does the thinking"
            about="Your own subscription, through its command-line tool. No API keys."
          >
            <div className="providers">
              {(["auto", "codex", "claude", "opencode"] as const).map((p) => (
                <label key={p} className="provider" data-on={s.provider === p || undefined}>
                  <input
                    type="radio"
                    name="provider"
                    checked={s.provider === p}
                    onChange={() => save({ provider: p })}
                  />
                  <span className="provider-name">{p === "auto" ? "Automatic" : PROVIDER_NAMES[p]}</span>
                  <span className="provider-status">
                    {p === "auto" && `uses ${PROVIDER_NAMES[info.active]} now`}
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
                    {p === "opencode" &&
                      (info.opencode.installed
                        ? `${info.opencode.version} · ${info.opencode.accounts.join(", ") || "free models (opencode auth login for more)"}`
                        : info.opencode.version
                          ? "needs OpenCode 2: run opencode upgrade --major"
                          : "not installed: npm i -g @opencode/cli")}
                  </span>
                </label>
              ))}
            </div>
            <details className="disclosure" onToggle={(e) => e.currentTarget.open && listModels()}>
              <summary>Models and speed</summary>
              <h3 className="sub-title">Codex models</h3>
              {tier("codex")}
              <h3 className="sub-title">Claude Code models</h3>
              {tier("claude")}
              <h3 className="sub-title">OpenCode models</h3>
              {tier("opencode")}
              <datalist id="opencode-models">
                {opencodeModels.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
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
                  Quick: figures, cards, quizzes, grading (seconds). Careful: chapter planning, asking the vault,
                  “careful” figures. Now running {info.load.running}, waiting {info.load.waiting}.
                </p>
              </div>
            </details>
          </Section>

          <Section
            anchor="agents"
            title="Agents in your vault"
            about="Agents read only your vault, have no network, and make their changes on their own branch, as one commit you can undo."
          >
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
                Add them straight away (marked AI); I remove the ones I don’t want
              </label>
            </div>
          </Section>

          <Section
            anchor="you"
            title="You"
            about="Who you are and how you like to learn. The tutor, the figures and the quizzes adapt to it."
          >
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
          </Section>

          <Section
            anchor="vault"
            title="Vaults"
            about="Where everything you make is kept: each vault a folder of its own, with its own history. A book in several vaults is kept once."
          >
            <VaultList />
            {vault && (
              <>
                <p className="fine">
                  The open one is plain Markdown in <code>{vault.path}</code>: {vault.notes} notes, {vault.concepts}{" "}
                  concepts, {vault.cards} cards, {vault.figures} figures. Open it in any editor or Obsidian. Jujutsu
                  (jj) keeps every version, and each agent request can be undone.
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
              </>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
