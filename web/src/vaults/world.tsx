/* How Markdown from a vault behaves on the page: its [[links]] and [text](path) links open in
 * that vault (a link to nothing yet is shown as such), its #tags search it, its task boxes can be ticked,
 * and its embeds show what they name: a note or one section or block of it (framed, with its own links
 * working from where it lives), a picture (at the width "|300" asks for), a PDF (at "#page=3"), sound or
 * video to play, or any other file to download. */
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { type VaultNote, type VaultResolved, vaultFileUrl, vaults } from "../api";
import { Markdown, type MarkdownWorld, MarkdownWorldContext } from "../components/Markdown";
import { linkRoute, noteRoute, openVaultLink, searchRoute } from "./routes";

/** The world for the text of note `from` in vault `id`; `outgoing` (its links, resolved) marks the missing ones. */
export function useVaultWorld(
  id: string,
  from: string,
  outgoing?: VaultNote["outgoing"],
  toggleTask?: (line: number) => void,
): MarkdownWorld {
  return useMemo(() => vaultWorld(id, from, outgoing, toggleTask), [id, from, outgoing, toggleTask]);
}

function vaultWorld(
  id: string,
  from: string,
  outgoing?: VaultNote["outgoing"],
  toggleTask?: (line: number) => void,
): MarkdownWorld {
  return {
    href: (target, sub, md) => (target ? linkRoute(id, target, { sub, from, md }) : noteRoute(id, from, sub)),
    open: (target, sub, md) => void openVaultLink(id, target, { sub, from, md }),
    missing: outgoing
      ? (target, md) => outgoing.some((o) => !o.path && !o.app && o.md === !!md && o.target === target.trim())
      : undefined,
    embed: (e) => <VaultEmbed key={`${e.target}#${e.sub ?? ""}`} vault={id} from={from} {...e} />,
    tagHref: (tag) => searchRoute(id, `#${tag}`),
    toggleTask,
  };
}

/** "|300" or "|300x200" after a picture's name is its size, as in Obsidian; anything else is its alt text. */
function sizeOf(alias?: string): { width?: number; height?: number; alt?: string } {
  const m = alias && /^(\d+)(?:x(\d+))?$/.exec(alias.trim());
  if (!m) return { alt: alias };
  return { width: Number(m[1]), height: m[2] ? Number(m[2]) : undefined };
}

export function VaultEmbed({
  vault,
  from,
  target,
  sub,
  alias,
  md,
  depth,
  theme,
}: {
  vault: string;
  from: string;
  target: string;
  sub?: string;
  alias?: string;
  md?: boolean;
  depth: number;
  theme: "light" | "dark";
}) {
  const [state, setState] = useState<{ resolved?: VaultResolved; error?: boolean }>({});
  useEffect(() => {
    let alive = true;
    vaults.resolve(vault, target, { from, sub, md, body: true }).then(
      (resolved) => alive && setState({ resolved }),
      () => alive && setState({ error: true }),
    );
    return () => {
      alive = false;
    };
  }, [vault, target, from, sub, md]);
  const world = useVaultWorld(vault, state.resolved?.path || from);
  const link = (children: ReactNode) => (
    <a
      href={linkRoute(vault, target, { sub, from, md })}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        void openVaultLink(vault, target, { sub, from, md });
      }}
    >
      {children}
    </a>
  );

  if (state.error)
    return (
      <span className="md-embed-box missing">
        {link(target)} <span className="fine">doesn't exist yet</span>
      </span>
    );
  const r = state.resolved;
  if (!r) return <span className="md-embed-box fine">Loading {target}…</span>;
  const url = vaultFileUrl(vault, r.path);
  if (r.kind === "image") {
    const { width, height, alt } = sizeOf(alias);
    return <img className="vault-image" src={url} alt={alt ?? r.name} width={width} height={height} loading="lazy" />;
  }
  if (r.kind === "pdf") {
    const page = /^page=(\d+)/.exec(sub || "")?.[1];
    return (
      <span className="md-embed-box vault-media" data-kind="pdf">
        <span className="md-embed-head">
          <span className="eyebrow">PDF</span>
          {link(r.name)}
        </span>
        <iframe className="vault-pdf" src={`${url}${page ? `#page=${page}` : ""}`} title={`PDF: ${r.name}`} />
      </span>
    );
  }
  if (r.kind === "audio")
    return (
      // biome-ignore lint/a11y/useMediaCaption: a recording from the user's own vault; it has no captions to give
      <audio className="vault-audio" src={url} controls preload="metadata" aria-label={r.name} />
    );
  if (r.kind === "video")
    return (
      // biome-ignore lint/a11y/useMediaCaption: a video from the user's own vault; it has no captions to give
      <video className="vault-video" src={url} controls preload="metadata" aria-label={r.name} />
    );
  if (r.kind === "file")
    return (
      <span className="md-embed-box" data-kind="file">
        <a href={url} download={r.name}>
          {r.name}
        </a>
      </span>
    );
  return (
    <span className="md-embed-box" data-kind="note">
      <span className="md-embed-head">
        <span className="eyebrow">note</span>
        {link(alias || (sub ? `${r.name} › ${sub.replace(/^\^/, "")}` : r.name))}
      </span>
      {r.body ? (
        <MarkdownWorldContext.Provider value={world}>
          <Markdown text={r.body} theme={theme} depth={depth + 1} />
        </MarkdownWorldContext.Provider>
      ) : null}
    </span>
  );
}
