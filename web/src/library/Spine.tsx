/* A book on the shelf and in your hands: its spine (cloth in its topic's pastel, the title running
 * down it, the author at the foot, a ribbon while you're partway through), its front cover (its own
 * picture tinted in that pastel, or a typeset cover), and the topic's little icon. */
import {
  Atom,
  Brain,
  Briefcase,
  Code,
  Cog,
  Feather,
  FlaskConical,
  GraduationCap,
  HeartPulse,
  Landmark,
  Leaf,
  Lightbulb,
  type LucideIcon,
  Mountain,
  Palette,
  Shapes,
  Sigma,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { memo, useState } from "react";
import { topicOf } from "../../../shared/topics.ts";
import { api, type Book } from "../api";
import type { Look } from "./shelf";

const ICONS: Record<string, LucideIcon> = {
  math: Sigma,
  physics: Atom,
  chemistry: FlaskConical,
  biology: Leaf,
  earth: Mountain,
  medicine: HeartPulse,
  mind: Brain,
  computing: Code,
  ai: Sparkles,
  engineering: Cog,
  economics: TrendingUp,
  business: Briefcase,
  history: Landmark,
  society: Users,
  philosophy: Lightbulb,
  learning: GraduationCap,
  writing: Feather,
  design: Palette,
  other: Shapes,
};

export function TopicIcon({ topic, size = 15 }: { topic?: string; size?: number }) {
  const Icon = ICONS[topicOf(topic).key] || Shapes;
  return <Icon className="topic-icon" width={size} height={size} aria-hidden="true" />;
}

const lastName = (author: string) =>
  author
    .split(/&|,| and /)[0]
    .trim()
    .split(/\s+/)
    .at(-1) || author;

/** Who wrote it, or else where it's from. */
export const bylineOf = (book: Book) =>
  book.author || book.source?.site || (book.format === "pdf" ? "PDF" : book.format === "web" ? "Article" : "");

export const Spine = memo(function Spine({ book, look, reading }: { book: Book; look: Look; reading: boolean }) {
  const by = lastName(bylineOf(book));
  // the title as large as fits down the spine, within reason
  const room = look.h - (look.binding === "label" ? 96 : 70);
  const size = Math.max(
    9.5,
    Math.min(14.5, look.w * 0.34, (room * (look.w >= 50 ? 1.9 : 1)) / (book.title.length * 0.52)),
  );
  const bySize = Math.min(10.5, (look.w - 10) / Math.max(1, by.length * 0.6));
  return (
    <span
      className="spine"
      data-tone={look.tone}
      data-shade={look.shade}
      data-binding={look.binding}
      data-wide={look.w >= 50 || undefined}
      style={{ width: look.w, height: look.h }}
    >
      {reading && <span className="spine-ribbon" />}
      {look.binding === "plain" && book.topic && (
        <span className="spine-icon">
          <TopicIcon topic={book.topic} size={13} />
        </span>
      )}
      <span className="spine-title-wrap">
        <span className="spine-title" style={{ fontSize: size }}>
          {book.title}
        </span>
      </span>
      {bySize >= 7 && by && (
        <span className="spine-by" style={{ fontSize: bySize }}>
          {by}
        </span>
      )}
    </span>
  );
});

/** The front of a book: its picture tinted in the topic's pastel, or a typeset cover. */
export const Cover = memo(function Cover({ book, look }: { book: Book; look: Look }) {
  const [broken, setBroken] = useState(false);
  const topic = topicOf(book.topic);
  const year = book.source?.published?.slice(0, 4);
  return (
    <span className="cover" data-tone={look.tone} data-shade={look.shade}>
      <span className="cover-plate">
        {book.cover && !broken ? (
          <img src={api.coverUrl(book.id)} alt="" decoding="async" draggable={false} onError={() => setBroken(true)} />
        ) : (
          <span className="cover-mark">
            <TopicIcon topic={book.topic} size={44} />
          </span>
        )}
      </span>
      <span className="cover-type">
        <span className="cover-kicker">
          {book.topic ? topic.name : book.format === "web" ? "Article" : "Book"}
          {year ? ` · ${year}` : ""}
        </span>
        <span className="cover-title">{book.title}</span>
        <span className="cover-author">{bylineOf(book)}</span>
      </span>
      <span className="cover-hinge" />
    </span>
  );
});
