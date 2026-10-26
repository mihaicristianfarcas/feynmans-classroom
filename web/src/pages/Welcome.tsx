/* The first-run page: who you are and how you learn, before anything else. */
import { useState } from "react";
import { learn, type Profile } from "../api";
import { go } from "../app/navigation";
import { PROVIDER_NAMES, providerReady } from "../app/provider";
import { ProfileForm } from "../components/ProfileForm";
import { useLoad } from "../lib/useLoad";

/** First run: who you are and how you learn. Saved to profile.md in your vault. */
export function Welcome() {
  const { data: profile } = useLoad(() => learn.profile());
  const { data: settings } = useLoad(() => learn.settings());
  const [saving, setSaving] = useState(false);
  if (!profile) return <div className="center-note">Opening…</div>;
  const ready = settings && providerReady(settings);
  return (
    <div className="welcome">
      <div className="brand big">
        <span className="brand-mark" aria-hidden="true" />
        <span>Feynman’s Classroom</span>
      </div>
      <h1 className="page-title">Learn anything the way Feynman taught it.</h1>
      <p className="lede">
        Read hard books beside figures you can play with, test yourself at the right moments, explain ideas back in your
        own words, and watch your knowledge grow as a graph. Everything stays on this machine, in plain files you own,
        and the thinking runs on your own Codex, Claude or OpenCode subscription.
      </p>
      <div className="callout" data-ok={ready ? "true" : "false"}>
        {settings ? (
          ready ? (
            <>
              Using{" "}
              <b>
                {PROVIDER_NAMES[settings.active]} ({settings[settings.active].version})
              </b>
              . You can switch in Settings.
            </>
          ) : (
            <>
              No model is ready. Install and log in to the Codex CLI (<code>codex login</code>), Claude Code (
              <code>claude</code>) or OpenCode (<code>opencode auth login</code>), then reload.
            </>
          )
        ) : (
          "Checking your subscriptions…"
        )}
      </div>
      <h2 className="section-title">Tell the tutor about you</h2>
      <ProfileForm
        initial={profile}
        saving={saving}
        submitLabel="Start learning"
        onSave={async (p: Profile) => {
          setSaving(true);
          await learn.saveProfile({ ...p, onboarded: true });
          setSaving(false);
          go("#/library");
        }}
      />
    </div>
  );
}
