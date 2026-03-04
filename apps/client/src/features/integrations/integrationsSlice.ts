import { createSlice } from "@reduxjs/toolkit";

interface IntegrationsState {
  selectedIntegration: string | null;
}

const initialState: IntegrationsState = {
  selectedIntegration: null,
};

const integrationsSlice = createSlice({
  name: "integrations",
  initialState,
  reducers: {
    setSelectedIntegration: (state, action: { payload: string | null }) => {
      state.selectedIntegration = action.payload;
    },
  },
});

export const { setSelectedIntegration } = integrationsSlice.actions;
export default integrationsSlice.reducer;
