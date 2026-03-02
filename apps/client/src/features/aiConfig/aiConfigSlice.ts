import { createSlice } from "@reduxjs/toolkit";
import type { Service, KnowledgeDocument, TransferRule } from "./types";

interface AiConfigState {
  systemPrompt: string;
  voiceId: string;
  greetingMessage: string;
  transferNumber: string;
  tone: "friendly" | "professional" | "formal" | "casual";
  speechSpeed: number;
  services: Service[];
  knowledgeDocuments: KnowledgeDocument[];
  transferRules: TransferRule[];
}

const initialState: AiConfigState = {
  systemPrompt: "",
  voiceId: "",
  greetingMessage: "Hi, thank you for calling. How can I help you today?",
  transferNumber: "",
  tone: "professional",
  speechSpeed: 1,
  services: [],
  knowledgeDocuments: [],
  transferRules: [],
};

const aiConfigSlice = createSlice({
  name: "aiConfig",
  initialState,
  reducers: {
    setSystemPrompt: (state, action: { payload: string }) => {
      state.systemPrompt = action.payload;
    },
    setVoiceConfig: (
      state,
      action: {
        payload: {
          voiceId?: string;
          greetingMessage?: string;
          tone?: AiConfigState["tone"];
          speechSpeed?: number;
        };
      }
    ) => {
      if (action.payload.voiceId !== undefined)
        state.voiceId = action.payload.voiceId;
      if (action.payload.greetingMessage !== undefined)
        state.greetingMessage = action.payload.greetingMessage;
      if (action.payload.tone !== undefined) state.tone = action.payload.tone;
      if (action.payload.speechSpeed !== undefined)
        state.speechSpeed = action.payload.speechSpeed;
    },
    setTransferNumber: (state, action: { payload: string }) => {
      state.transferNumber = action.payload;
    },
    setServices: (state, action: { payload: Service[] }) => {
      state.services = action.payload;
    },
    setKnowledgeDocuments: (
      state,
      action: { payload: KnowledgeDocument[] }
    ) => {
      state.knowledgeDocuments = action.payload;
    },
    setTransferRules: (state, action: { payload: TransferRule[] }) => {
      state.transferRules = action.payload;
    },
  },
});

export const {
  setSystemPrompt,
  setVoiceConfig,
  setTransferNumber,
  setServices,
  setKnowledgeDocuments,
  setTransferRules,
} = aiConfigSlice.actions;
export default aiConfigSlice.reducer;
