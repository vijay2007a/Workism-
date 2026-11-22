import { useState, type FormEvent, type ReactNode } from 'react';
import { ExternalLink, GitBranch, RotateCcw, Star } from 'lucide-react';
import { Chip } from '../glass/controls';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassInput } from '../glass/LiquidGlassInput';
import { useI18n } from '../lib/i18n';
import { setProfile, useStore } from '../lib/store';
import { publicRepos, type Repo } from '../services';

/** Public repositories by username, fetched from GitHub only when asked. `action` adds a control to each one. */
export function GitHubConnect({ action }: { action?: (repo: Repo) => ReactNode }) {
  const { t, number } = useI18n();
  const saved = useStore((s) => s.profile.github);
  const [user, setUser] = useState(saved);
  const [repos, setRepos] = useState<Repo[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (e: FormEvent) => {
    e.preventDefault();
    const name = user.trim();
    if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(name)) return setError('Enter a GitHub username, without the link.');
    setBusy(true);
    setError('');
    try {
      setRepos(await publicRepos(name));
      setProfile({ github: name });
    } catch (err) {
      // fetch throws TypeError when the network itself failed
      setError(err instanceof TypeError ? 'GitHub could not be reached. Check your connection.' : (err as Error).message);
    }
    setBusy(false);
  };

  return (
    <div>
      <form onSubmit={load} noValidate className="flex flex-wrap items-end gap-3">
        <LiquidGlassInput className="min-w-56 flex-1" label={t('GitHub username')} icon={<GitBranch aria-hidden />} autoComplete="off" spellCheck={false} value={user} error={error && t(error)} onChange={(e) => setUser(e.target.value)} />
        <LiquidGlassButton type="submit" loading={busy} icon={repos ? <RotateCcw aria-hidden /> : undefined} className={error ? 'mb-7' : undefined}>
          {repos ? t('Refresh') : t('Show repositories')}
        </LiquidGlassButton>
      </form>
      <p className="mt-2 ps-4 text-sm text-ink-soft">{t('Reads public data from api.github.com. Private repositories need the WORKISM GitHub app.')}</p>
      {repos && (
        <ul className="mt-5 grid gap-3 tab:grid-cols-2">
          {repos.map((r) => (
            <li key={r.name} className="lg-inset flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <a href={r.html_url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-violet-deep hover:underline">
                  <span className="truncate">{r.name}</span>
                  <ExternalLink className="size-4 flex-none" aria-label={t('opens in a new tab')} />
                </a>
                <span className="inline-flex items-center gap-1 text-sm">
                  <Star className="size-4" aria-hidden />
                  {number(r.stargazers_count)}
                </span>
              </div>
              {r.description && <p className="line-clamp-2 text-sm text-ink-soft">{r.description}</p>}
              <div className="mt-auto flex items-center justify-between gap-3">
                {r.language ? <Chip>{r.language}</Chip> : <span />}
                {action?.(r)}
              </div>
            </li>
          ))}
          {repos.length === 0 && <li className="text-ink-soft">{t('No public repositories yet.')}</li>}
        </ul>
      )}
    </div>
  );
}
