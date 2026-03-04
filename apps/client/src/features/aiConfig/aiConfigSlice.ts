import { createSlice } from "@reduxjs/toolkit";

interface AiConfigState {
  activeTab: string;
  isDirty: boolean;
}

const initialState: AiConfigState = {
  activeTab: "configuration",
  isDirty: false,
};

const aiConfigSlice = createSlice({
  name: "aiConfig",
  initialState,
  reducers: {
    setActiveTab: (state, action: { payload: string }) => {
      state.activeTab = action.payload;
    },
    setDirty: (state, action: { payload: boolean }) => {
      state.isDirty = action.payload;
    },
  },
});

export const { setActiveTab, setDirty } = aiConfigSlice.actions;
export default aiConfigSlice.reducer;
