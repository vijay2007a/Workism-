import { lazy, Suspense, useEffect } from 'react';
import { MotionConfig } from 'motion/react';
import { Route, Routes, useLocation } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { AssistantProvider } from './components/AIAssistantPanel';
import { GlassToastProvider } from './glass/GlassToast';
import { useCalm, useLite } from './lib/effects';
import { AuthProvider } from './lib/auth';
import { I18nProvider } from './lib/i18n';
import { useStore } from './lib/store';
import { WorkspaceProvider } from './lib/workspace';

const Landing = lazy(() => import('./pages/Landing'));
const Auth = lazy(() => import('./pages/Auth'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Skills = lazy(() => import('./pages/Skills'));
const Learn = lazy(() => import('./pages/Learn'));
const CoursePage = lazy(() => import('./pages/CoursePage'));
const LanguagesPage = lazy(() => import('./pages/Languages'));
const Labs = lazy(() => import('./pages/Labs'));
const ProjectPage = lazy(() => import('./pages/ProjectPage'));
const Assessments = lazy(() => import('./pages/Assessments'));
const Quiz = lazy(() => import('./pages/Quiz'));
const CodeChallenge = lazy(() => import('./pages/CodeChallenge'));
const Certificates = lazy(() => import('./pages/Certificates'));
const CertificatePage = lazy(() => import('./pages/CertificatePage'));
const Verify = lazy(() => import('./pages/Verify'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const PublicPortfolio = lazy(() => import('./pages/PublicPortfolio'));
const Instructor = lazy(() => import('./pages/Instructor'));
const Admin = lazy(() => import('./pages/Admin'));
const Assistant = lazy(() => import('./pages/Assistant'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

/** Mirrors preferences onto <html>, where index.css reads them. */
function useRootAttributes() {
  const calm = useCalm();
  const lite = useLite();
  const clarity = useStore((s) => s.settings.clarity);
  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute('data-calm', calm);
    root.dataset.effects = lite ? 'light' : 'full';
    root.style.setProperty('--frost', String(clarity / 100));
  }, [calm, lite, clarity]);
  return calm;
}

function Screens() {
  const calm = useRootAttributes();
  const { pathname } = useLocation();
  useEffect(() => {
    void window.scrollTo({ top: 0, behavior: 'instant' }); // returns a promise in newer browsers
  }, [pathname]);
  return (
    <MotionConfig reducedMotion={calm ? 'always' : 'never'}>
      <Suspense fallback={<div className="aurora" />}>
        <Routes>
          <Route index element={<Landing />} />
          <Route path="login" element={<Auth key="login" mode="login" />} />
          <Route path="register" element={<Auth key="register" mode="register" />} />
          <Route path="auth/callback" element={<AuthCallback />} />
          <Route path="reset-password" element={<ResetPassword />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="verify/:id" element={<Verify />} />
          <Route path="u/:slug" element={<PublicPortfolio />} />
          <Route element={<AppLayout />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="skills" element={<Skills />} />
            <Route path="learn" element={<Learn />} />
            <Route path="learn/:courseId/:lessonId?" element={<CoursePage />} />
            <Route path="learn/languages" element={<LanguagesPage />} />
            <Route path="labs" element={<Labs />} />
            <Route path="labs/:id" element={<ProjectPage />} />
            <Route path="assessments" element={<Assessments />} />
            <Route path="assessments/quiz/:skillId" element={<Quiz />} />
            <Route path="assessments/code/:id" element={<CodeChallenge />} />
            <Route path="certificates" element={<Certificates />} />
            <Route path="certificates/:id" element={<CertificatePage />} />
            <Route path="portfolio" element={<Portfolio />} />
            <Route path="assistant" element={<Assistant />} />
            <Route path="instructor" element={<Instructor />} />
            <Route path="admin" element={<Admin />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </MotionConfig>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <GlassToastProvider>
            <AssistantProvider>
              <Screens />
            </AssistantProvider>
          </GlassToastProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
