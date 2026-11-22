import { AIAssistantPanel } from '../components/AIAssistantPanel';
import { PageHeader } from '../components/PageHeader';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { useI18n } from '../lib/i18n';

export default function Assistant() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('AI Assistant')} subtitle={t('Questions about lessons, projects or your next step.')} />
      <LiquidGlassPanel className="flex h-[calc(100dvh-18.5rem)] min-h-[22rem] tab:h-[min(44rem,calc(100dvh-15rem))] flex-col p-4!" tint="rgb(206 190 255 / .5)">
        <AIAssistantPanel className="flex-1" />
      </LiquidGlassPanel>
    </>
  );
}
