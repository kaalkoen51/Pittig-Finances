import { useEffect } from 'react';
import { AppShell } from './shell/AppShell';
import { LoadingScreen } from './shell/LoadingScreen';
import { RecoveryScreen } from './shell/RecoveryScreen';
import { StoreProvider, useAppStatus, useData } from './state/store';
import type { Storage } from './storage/types';
import { ConfirmProvider, ToastProvider } from './ui';

function Root() {
  const { status } = useAppStatus();
  const lang = useData().settings.language;
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  if (status === 'loading') return <LoadingScreen />;
  if (status === 'recovery') return <RecoveryScreen />;
  return <AppShell />;
}

export default function App({ storage }: { storage?: Storage }) {
  return (
    <StoreProvider storage={storage}>
      <ToastProvider>
        <ConfirmProvider>
          <Root />
        </ConfirmProvider>
      </ToastProvider>
    </StoreProvider>
  );
}
