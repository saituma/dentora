import { createSlice } from "@reduxjs/toolkit";
import type { ClinicProfile } from "./types";

const initialState: { profile: ClinicProfile | null } = {
  profile: null,
};

const clinicSlice = createSlice({
  name: "clinic",
  initialState,
  reducers: {
    setProfile: (state, action: { payload: ClinicProfile | null }) => {
      state.profile = action.payload;
    },
  },
});

export const { setProfile } = clinicSlice.actions;
export default clinicSlice.reducer;
