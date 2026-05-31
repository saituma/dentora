import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/features/auth/authSlice';
import clinicReducer from '@/features/clinic/clinicSlice';
import aiConfigReducer from '@/features/aiConfig/aiConfigSlice';
import callsReducer from '@/features/calls/callsSlice';
import analyticsReducer from '@/features/analytics/analyticsSlice';
import integrationsReducer from '@/features/integrations/integrationsSlice';
import uiReducer from '@/features/ui/uiSlice';
import { loadAuthSession } from '@/features/auth/session';
import { soundMiddleware } from './soundMiddleware';
import type { AuthState } from '@/features/auth/types';

// Synchronously read the persisted auth session so isHydrated=true before the
// first React paint. Returning users see the dashboard immediately; background
// token validation in AuthBootstrap handles security without blocking the UI.
function getPreloadedAuthState(): { auth: AuthState } | undefined {
  if (typeof window === 'undefined') return undefined;
  const session = loadAuthSession();
  if (!session) return undefined;
  return {
    auth: {
      user: session.user,
      tenantId: session.tenantId,
      isAuthenticated: true,
      onboardingStatus: session.onboardingStatus ?? 'clinic-profile',
      isHydrated: true,
    },
  };
}
import { authApi } from '@/features/auth/authApi';
import { clinicApi } from '@/features/clinic/clinicApi';
import { aiConfigApi } from '@/features/aiConfig/aiConfigApi';
import { callsApi } from '@/features/calls/callsApi';
import { analyticsApi } from '@/features/analytics/analyticsApi';
import { integrationsApi } from '@/features/integrations/integrationsApi';
import { onboardingApi } from '@/features/onboarding/onboardingApi';
import { llmApi } from '@/features/llm/llmApi';
import { elevenlabsApi } from '@/features/elevenlabs/elevenlabsApi';
import { appointmentsApi } from '@/features/appointments/appointmentsApi';
import { patientsApi } from '@/features/patients/patientsApi';
import { telephonyApi } from '@/features/telephony/telephonyApi';
import { staffReviewApi } from '@/features/staffReview/staffReviewApi';
import { remindersApi } from '@/features/reminders/remindersApi';

export const store = configureStore({
  preloadedState: getPreloadedAuthState(),
  reducer: {
    auth: authReducer,
    clinic: clinicReducer,
    aiConfig: aiConfigReducer,
    calls: callsReducer,
    analytics: analyticsReducer,
    integrations: integrationsReducer,
    ui: uiReducer,
    [authApi.reducerPath]: authApi.reducer,
    [clinicApi.reducerPath]: clinicApi.reducer,
    [aiConfigApi.reducerPath]: aiConfigApi.reducer,
    [callsApi.reducerPath]: callsApi.reducer,
    [analyticsApi.reducerPath]: analyticsApi.reducer,
    [integrationsApi.reducerPath]: integrationsApi.reducer,
    [onboardingApi.reducerPath]: onboardingApi.reducer,
    [llmApi.reducerPath]: llmApi.reducer,
    [elevenlabsApi.reducerPath]: elevenlabsApi.reducer,
    [appointmentsApi.reducerPath]: appointmentsApi.reducer,
    [patientsApi.reducerPath]: patientsApi.reducer,
    [telephonyApi.reducerPath]: telephonyApi.reducer,
    [staffReviewApi.reducerPath]: staffReviewApi.reducer,
    [remindersApi.reducerPath]: remindersApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: { warnAfter: 128 },
    }).concat(
      authApi.middleware,
      clinicApi.middleware,
      aiConfigApi.middleware,
      callsApi.middleware,
      analyticsApi.middleware,
      integrationsApi.middleware,
      onboardingApi.middleware,
      llmApi.middleware,
      elevenlabsApi.middleware,
      appointmentsApi.middleware,
      patientsApi.middleware,
      telephonyApi.middleware,
      staffReviewApi.middleware,
      remindersApi.middleware,
      soundMiddleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
