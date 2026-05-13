'use client';

import { createContext, useContext, type ReactNode } from 'react';

interface OnboardingUiContextValue {
  featureTutorialsEnabled: boolean;
}

const OnboardingUiContext = createContext<OnboardingUiContextValue>({
  featureTutorialsEnabled: true,
});

interface OnboardingUiProviderProps {
  children: ReactNode;
  featureTutorialsEnabled?: boolean;
}

export function OnboardingUiProvider({ children, featureTutorialsEnabled = true }: OnboardingUiProviderProps) {
  return (
    <OnboardingUiContext.Provider value={{ featureTutorialsEnabled }}>
      {children}
    </OnboardingUiContext.Provider>
  );
}

export function useOnboardingUi() {
  return useContext(OnboardingUiContext);
}
