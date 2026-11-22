import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GlassSelect } from '../glass/controls';
import { useCalm } from '../lib/effects';
import { useI18n } from '../lib/i18n';
import { skillColor } from '../lib/workspace';
import type { Skill } from '../services';

// The only module that imports Recharts, so it loads when a chart is first needed.
const YOU = '#6a48ec';
const GOAL = '#5f6480';
const TIP = { borderRadius: 16, border: 0, background: 'rgb(255 255 255 / .96)', boxShadow: '0 14px 30px -12px rgb(60 44 130 / .5)', color: '#24263a' };

export function SkillRadar({ skills }: { skills: Skill[] }) {
  const { t } = useI18n();
  const calm = useCalm();
  const you = t('You');
  const goal = t('Goal');
  const data = skills.map((s) => ({ name: s.name, [you]: s.score, [goal]: s.target }));
  return (
    <>
      <div className="h-[26rem]" dir="ltr">
        <ResponsiveContainer>
          <RadarChart data={data} outerRadius="72%" margin={{ top: 8, right: 44, bottom: 4, left: 44 }}>
            <PolarGrid stroke="#8e88b4" strokeOpacity={0.45} />
            <PolarAngleAxis dataKey="name" tick={{ fill: '#24263a', fontSize: 14 }} />
            <PolarRadiusAxis domain={[0, 100]} tickCount={5} tickFormatter={(v: number) => (v === 100 ? '' : String(v))} tick={{ fill: '#4a4f67', fontSize: 11 }} axisLine={false} angle={90} />
            <Radar dataKey={goal} stroke={GOAL} strokeWidth={2} fill={GOAL} fillOpacity={0.06} isAnimationActive={!calm} />
            <Radar dataKey={you} stroke={YOU} strokeWidth={2} fill={YOU} fillOpacity={0.2} isAnimationActive={!calm} dot={{ r: 4, fill: YOU, stroke: '#fff', strokeWidth: 2 }} />
            <Tooltip contentStyle={TIP} />
            <Legend iconType="circle" formatter={(v) => <span className="text-ink">{v}</span>} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <DataTable head={[t('Skill'), you, goal]} rows={skills.map((s) => [s.name, s.score, s.target])} />
    </>
  );
}

export function History({ skills }: { skills: Skill[] }) {
  const { t, date } = useI18n();
  const calm = useCalm();
  const [id, setId] = useState(skills[0].id);
  const skill = skills.find((s) => s.id === id) ?? skills[0];
  const color = skillColor(skills, skill.id);
  const [now] = useState(() => new Date());
  const data = useMemo(() => {
    return skill.history.map((score, i) => ({
      month: date(new Date(now.getFullYear(), now.getMonth() - (skill.history.length - 1 - i), 1).getTime(), { month: 'short' }),
      score,
    }));
  }, [skill, date, now]);
  return (
    <>
      <div className="mb-4 max-w-xs">
        <GlassSelect label={t('Skill')} value={id} onChange={setId} options={skills.map((s) => [s.id, s.name] as const)} />
      </div>
      <div className="h-72" dir="ltr">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="#8e88b4" strokeOpacity={0.35} vertical={false} />
            <XAxis dataKey="month" tick={{ fill: '#4a4f67', fontSize: 13 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: '#4a4f67', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TIP} cursor={{ stroke: '#4a4f67', strokeWidth: 1 }} formatter={(v) => [v, skill.name]} />
            <Area dataKey="score" type="monotone" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.12} isAnimationActive={!calm} dot={{ r: 4, fill: color, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <DataTable head={[t('Month'), skill.name]} rows={data.map((d) => [d.month, d.score])} />
    </>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  const { t, number } = useI18n();
  return (
    <details className="mt-3">
      <summary className="w-fit rounded-full py-1 text-[0.9375rem] font-medium text-violet-deep">{t('View as a table')}</summary>
      <table className="mt-2 w-full max-w-lg text-start text-[0.9375rem]">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="py-1.5 pe-4 text-start font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-t border-white/60">
              {r.map((c, i) => (
                <td key={head[i]} className="py-1.5 pe-4 tabular-nums">
                  {typeof c === 'number' ? number(c) : c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
