import { configureStore } from "@reduxjs/toolkit";
import authReducer from "@/features/auth/authSlice";
import clinicReducer from "@/features/clinic/clinicSlice";
import aiConfigReducer from "@/features/aiConfig/aiConfigSlice";
import callsReducer from "@/features/calls/callsSlice";
import analyticsReducer from "@/features/analytics/analyticsSlice";
import integrationsReducer from "@/features/integrations/integrationsSlice";
import billingReducer from "@/features/billing/billingSlice";
import uiReducer from "@/features/ui/uiSlice";
import { authApi } from "@/features/auth/authApi";
import { clinicApi } from "@/features/clinic/clinicApi";
import { aiConfigApi } from "@/features/aiConfig/aiConfigApi";
import { callsApi } from "@/features/calls/callsApi";
import { analyticsApi } from "@/features/analytics/analyticsApi";
import { integrationsApi } from "@/features/integrations/integrationsApi";
import { billingApi } from "@/features/billing/billingApi";
import { onboardingApi } from "@/features/onboarding/onboardingApi";
import { llmApi } from "@/features/llm/llmApi";
import { elevenlabsApi } from "@/features/elevenlabs/elevenlabsApi";
import { appointmentsApi } from "@/features/appointments/appointmentsApi";
import { patientsApi } from "@/features/patients/patientsApi";
import { telephonyApi } from "@/features/telephony/telephonyApi";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    clinic: clinicReducer,
    aiConfig: aiConfigReducer,
    calls: callsReducer,
    analytics: analyticsReducer,
    integrations: integrationsReducer,
    billing: billingReducer,
    ui: uiReducer,
    [authApi.reducerPath]: authApi.reducer,
    [clinicApi.reducerPath]: clinicApi.reducer,
    [aiConfigApi.reducerPath]: aiConfigApi.reducer,
    [callsApi.reducerPath]: callsApi.reducer,
    [analyticsApi.reducerPath]: analyticsApi.reducer,
    [integrationsApi.reducerPath]: integrationsApi.reducer,
    [billingApi.reducerPath]: billingApi.reducer,
    [onboardingApi.reducerPath]: onboardingApi.reducer,
    [llmApi.reducerPath]: llmApi.reducer,
    [elevenlabsApi.reducerPath]: elevenlabsApi.reducer,
    [appointmentsApi.reducerPath]: appointmentsApi.reducer,
    [patientsApi.reducerPath]: patientsApi.reducer,
    [telephonyApi.reducerPath]: telephonyApi.reducer,
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
      billingApi.middleware,
      onboardingApi.middleware,
      llmApi.middleware,
      elevenlabsApi.middleware,
      appointmentsApi.middleware,
      patientsApi.middleware,
      telephonyApi.middleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
