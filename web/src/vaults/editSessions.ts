/* Before a file or folder moves or is trashed, its open editors flush pending work and stop saving
 * the obsolete paths. Failed operations resume those editors. Shared by the reader and Notes. */
type Prepare = () => Promise<() => void>;
const sessions = new Set<{ vault: string; path: string; prepare: Prepare }>();

export function registerEditSession(vault: string, path: string, prepare: Prepare) {
  const session = { vault, path, prepare };
  sessions.add(session);
  return () => {
    sessions.delete(session);
  };
}

export async function mutateNotePath<T>(vault: string, path: string, mutate: () => Promise<T>): Promise<T> {
  const resume: (() => void)[] = [];
  try {
    for (const session of sessions) {
      if (session.vault === vault && (session.path === path || session.path.startsWith(`${path}/`)))
        resume.push(await session.prepare());
    }
    return await mutate();
  } catch (error) {
    for (const restart of resume) restart();
    throw error;
  }
}
