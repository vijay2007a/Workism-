import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Chip } from '../glass/controls';
import { useToast } from '../glass/GlassToast';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { useWorkspace } from '../lib/workspace';
import { api, type RemoteProfile, type UserRole } from '../services';

export default function Admin() {
  const { role } = useWorkspace();
  const toast = useToast();
  const [overview, setOverview] = useState<{ usersCount: number; coursesCount: number; languagesCount: number; aiUsage: { totalRequests: number } } | null>(null);
  const [users, setUsers] = useState<RemoteProfile[]>([]);
  const [logs, setLogs] = useState<{ id: string; action: string; resource_type: string; resource_id: string | null; created_at: string }[]>([]);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  const allowed = role === 'admin';

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    Promise.all([api.adminOverview(), api.adminUsers(), api.adminAuditLogs()]).then(
      ([ov, us, al]) => {
        if (!live) return;
        setOverview(ov);
        setUsers(us.users);
        setLogs(al.logs);
        setError('');
      },
      () => live && setError('Could not load administrator data.'),
    );
    return () => {
      live = false;
    };
  }, [allowed, reload]);

  if (!allowed) {
    return (
      <LiquidGlassPanel title="Administrator access required">
        <p className="flex items-center gap-2 text-ink-soft">
          <ShieldAlert className="size-5 text-bad" aria-hidden />
          Only administrators can access platform management and audit logs.
        </p>
      </LiquidGlassPanel>
    );
  }

  const changeRole = async (userId: string, nextRole: UserRole) => {
    try {
      await api.setUserRole(userId, nextRole);
      toast(`Updated role to ${nextRole}`);
      setReload((n) => n + 1);
    } catch {
      toast('Could not change role.', 'bad');
    }
  };

  return (
    <>
      <PageHeader title="Administrator Console" subtitle="User roles, AI usage monitoring, and security audit trail." />
      {error && <LiquidGlassPanel className="mb-5 text-bad">{error}</LiquidGlassPanel>}
      <div className="mb-5 grid gap-4 tab:grid-cols-4">
        <LiquidGlassPanel title="Users"><p className="text-3xl font-bold">{overview?.usersCount ?? 0}</p></LiquidGlassPanel>
        <LiquidGlassPanel title="Courses"><p className="text-3xl font-bold">{overview?.coursesCount ?? 0}</p></LiquidGlassPanel>
        <LiquidGlassPanel title="Languages"><p className="text-3xl font-bold">{overview?.languagesCount ?? 0}</p></LiquidGlassPanel>
        <LiquidGlassPanel title="AI Calls"><p className="text-3xl font-bold">{overview?.aiUsage.totalRequests ?? 0}</p></LiquidGlassPanel>
      </div>

      <div className="grid gap-5 desk:grid-cols-2">
        <LiquidGlassPanel title="Users & Roles">
          <ul className="grid gap-3">
            {users.map((u) => (
              <li key={u.id} className="lg-inset flex flex-wrap items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{u.displayName || u.email}</p>
                  <p className="truncate text-sm text-ink-soft">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Chip tone={u.role === 'admin' ? 'violet' : u.role === 'instructor' ? 'good' : undefined}>{u.role}</Chip>
                  {u.role !== 'instructor' && <LiquidGlassButton size="sm" onClick={() => void changeRole(u.id, 'instructor')}>Make Instructor</LiquidGlassButton>}
                  {u.role !== 'student' && u.role !== 'admin' && <LiquidGlassButton size="sm" onClick={() => void changeRole(u.id, 'student')}>Make Student</LiquidGlassButton>}
                </div>
              </li>
            ))}
          </ul>
        </LiquidGlassPanel>

        <LiquidGlassPanel title="Security Audit Logs">
          <ul className="grid max-h-96 gap-2.5 overflow-y-auto">
            {logs.map((l) => (
              <li key={l.id} className="lg-inset flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                <span className="font-mono">{l.action} · {l.resource_type}</span>
                <span className="text-ink-soft">{new Date(l.created_at).toLocaleString()}</span>
              </li>
            ))}
            {logs.length === 0 && <li className="text-ink-soft">No audit events recorded yet.</li>}
          </ul>
        </LiquidGlassPanel>
      </div>
    </>
  );
}
