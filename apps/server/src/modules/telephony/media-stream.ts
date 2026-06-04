import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import { logger } from '../../lib/logger.js';
import { enqueueJob, QUEUE_NAMES } from '../../lib/queue.js';
import type { CostAttributionJobData } from '../../workers/cost-attribution.worker.js';
import type { AnalyticsEventJobData } from '../../workers/analytics-events.worker.js';
import type { NotificationJobData } from '../../workers/notification-delivery.worker.js';
import * as callService from '../calls/call.service.js';
import { db } from '../../db/index.js';
import { callSessions, tenantConfigVersions } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { resolveApiKey } from '../api-keys/api-key.service.js';
import { decryptField } from '../../lib/encrypted-column.js';
import * as configService from '../config/config.service.js';
import { handleConvaiToolCall } from './convai-tools.js';
import { redirectLiveCallToFallback, isWithinBusinessHours } from './telephony.service.js';
import { ensureAgentPromptDates } from '../elevenlabs/ensure-agent-prompt.js';
import { elevenLabsFetch } from '../elevenlabs/elevenlabs-fetch.js';
import { runWithTenantContext, setActiveTenantContext } from '../../db/tenant-context.js';
import {
  assertMediaStreamCallSessionMatchesToken,
  verifyMediaStreamBinding,
} from './stream-token.js';
import {
  mediaStreamInvalidStartTotal,
  mediaStreamPendingLimitExceededTotal,
  mediaStreamStartTimeoutTotal,
  mediaStreamAbnormalDisconnectTotal,
} from '../../lib/metrics.js';
import { recordMediaStreamHealthEvent } from '../operational-health/operational-health.service.js';

interface SensitiveTopic {
  type?: string;
  title?: string;
  content?: string;
}

interface PolicyRecord {
  policyType?: string | null;
  content?: string | null;
  emergencyDisclaimer?: string | null;
  escalationConditions?: { type?: string; content?: string } | null;
  sensitiveTopics?: unknown;
}

export interface TwilioStartMessage {
  event: 'start';
  streamSid: string;
  start?: {
    callSid?: string;
    accountSid?: string;
    mediaFormat?: Record<string, unknown>;
    tracks?: string[];
    customParameters?: Record<string, string>;
  };
}

interface TwilioMediaMessage {
  event: 'media';
  media?: {
    payload?: string;
  };
}

interface ElevenLabsConversationInitMetadata {
  type: 'conversation_initiation_metadata';
  conversation_initiation_metadata_event?: {
    conversation_id?: string;
    user_input_audio_format?: string;
    agent_output_audio_format?: string;
  };
}

interface ElevenLabsAudioEvent {
  type: 'audio';
  audio_event?: { audio_base_64?: string };
}

interface ElevenLabsUserTranscript {
  type: 'user_transcript';
  user_transcription_event?: { user_transcript?: string };
}

interface ElevenLabsAgentResponse {
  type: 'agent_response';
  agent_response_event?: { agent_response?: string };
}

interface ElevenLabsClientToolCall {
  type: 'client_tool_call';
  client_tool_call?: {
    tool_name?: string;
    tool_call_id?: string;
    parameters?: Record<string, unknown>;
  };
}

interface ElevenLabsAgentToolResponse {
  type: 'agent_tool_response';
  agent_tool_response?: { tool_name?: string };
}

interface ElevenLabsInterruption {
  type: 'interruption';
}

interface ElevenLabsPing {
  type: 'ping';
  ping_event?: { event_id?: number };
}

type ElevenLabsMessage =
  | ElevenLabsConversationInitMetadata
  | ElevenLabsAudioEvent
  | ElevenLabsUserTranscript
  | ElevenLabsAgentResponse
  | ElevenLabsClientToolCall
  | ElevenLabsAgentToolResponse
  | ElevenLabsInterruption
  | ElevenLabsPing;

interface MediaStreamSession {
  callSessionId: string;
  tenantId: string;
  configVersionId: string;
  configVersion: number;
  streamSid: string;
  callSid?: string;
  ws: WebSocket;
  elevenSocket?: WebSocket;
  elevenReady: boolean;
  conversationId?: string;
  inputFormat?: string;
  outputFormat?: string;
  pendingAudioChunks: string[];
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>;
  lastActivityAt: number;
  startedAt: number;
  turnCount: number;
  firstMediaLogged?: boolean;
  dynamicVariables: Record<string, unknown>;
  contextualUpdate: string;
  needsTranscode?: boolean;
}

const activeSessions = new Map<string, MediaStreamSession>();

// Typing sound (keyboard recording, ulaw 8kHz, 2s) injected into Twilio audio when
// the agent says phrases that indicate it is writing something down.
const TYPING_SOUND_ULAW_B64 =
  'eX19enz6+/jv9nVweP/8+Pl7/vR+d3t6eXd5dXr3+Pp7fXt1eXVwdH79/fb6fnBwcnB7+/9++3x0dnVycnZ6ev36/vp6c3Bxev77+/v++/x8d3Jzd3r89vXx9vx9e////v/99vX08vb+e3Z2ffv08fb6+v39+3769vLu8PD4+/57fv348/Tz9vf5+313eXn++Pf09fn+/3x7/Pv5+/v5+fn9fv/8//r+/fj7+fr7en59fv13/Hd+d3V7b3pyffz7933/eH5y/f15/Hr5/nRtbnJ4c/3+ffz6+/j0/Obp7uf+6/X5+Gngdfl68en3+e1p+ddsevhp72vUYMswb7ND61PN2dtH3lxbNrYzR7i+uiFQ3r/ZLc27REK2sUNEckrQTt7awdtmu786PmjN0OPtzNE/7ttbQ1rSZmp1SX3DYNvOaVp24PzY385eUVVael5v6ehs4VdHV/9m6t9NTPb4b+nVaFxdTn5v59vw73ncfWV6cHHa63D962Pp6fHo+d3o+v/w1ubufWDweNjc7dxtcOPy7d7Y6Ovk6up16Onr5Xt3bV56d/58fF9pa15k8fV1+mptdHp8c/hw9Xhw8vX7/vR5dfxwbHj7+/jxe2/57/Dv9+zt6+bk5ufl6uz3+/P89Hlyb3dpYWBgaGlqaGdjaGFjZGVpaG90evr9e297fXx6e//39vN+dnd2fX59dn3z8/P38fDv7+/v7eno6eru8/L38/j9+H77fXdzb3BtbW5vb29uc3FycnR5dn1++/n5+/r6+vr19/t7fP19e3h2dXRzcXFvbnR1c3JxcnZ3eHt8fH5+/vr39vP08/X19vPw8fDx8vLx7+/v8fDv7+/w7uzs7O3u7u7t7u7v8PD1+fv9/X57dnV0cXBvb25vb25ub3Fyc3J0d3h6fH79/f3+/vz8/Pz8/P39fn1+fn7/ff7+/fz7+/r6+vn7+/n5+Pn5+vr7+/3+/f7+/n5+fn18fHt8fH1+ff78+/z8/Pr4+Pj3+fv7/P79/v5+e3p4d3h1dXVzcXBvbm5ub25rb212a2d4fGpqYm13cvN3bW9tdXZ9831yeX3+8nlvb3b19ft5c251+/X4fXNvdXv2+Pt9/fp9ev/8+vv9+v98ff/9/f56e/z5/vz+enz79ff8+vZ+/vz7+vv+fvz6+vT38PP69+/w+/P5enhwd251/f50dfnj/2n08/Tvc3Lt/H3sam5Z0FtNyXFWaGz/5FvjzFy+7U/R+ldUztLt4c/RXk/dW0rN1FDPyVTw0l1M7s9k3tXrZk/rY1bP31Xq5U1JYutfZcnkTXvdTkjd+k3S10pTcllN6tJ9+NTkVFn98l7izn52231da3VVV97tZdzXWFfb63Dd0uxq9nhre+7s6OfnfnZxaGp94enx2t9ucO7t7eDc3+fwbnr9++zn83ftfnJ8b2xz/HT04un6b3Bvee/8fv98cHB1cHJwfX1ycHZtaXj19e/l6fP2d2xvdvnx/G9zfvDu7vj5/HV++ujn5d/n7Nzl5/F2dv1eX+VycXdd7fJ583Jra2BiZmny537+cvDp5O/w8e/teOnw4+rt6ujt6XV9e/Tl+nb3/vry++p7eXbv8+J6+vpoe3J9e/dkdXBmemdt8Fl75VlRX2lVyja6uTq/RDh6Xb1c2Lw6PsJETcDOVkne4kZxXWPY6+V9UHdNPM/AUOy4XjPZxj3bsuFOv85B3shU9b3cT8/A61judE1hxcll/N1OQWLYXd3AaU3J4EjYxmXrw2RH+PpSft1mW2RdTExVXFZg4PZTcNpvb9rX6ujlY/fU4PLlblhu3ffr6GhZWFth6efz6uL6a2tz+ezd2NjwanZ36Nzf4+LwaHX5b/Lh9nr3fGtzfH737n1tbm14e//y/HN5c3Pw9G9ucmxtePl5b21oZWhoaXT/dW9zcW1w//747+/4/PXv6OLk6fT5ff3z7vDz/HJwbG1sbnFtZmRnZGhtcnZwa2JpbnX57vZ3c3FwdP36+3t0c2xqa3B2ent4cnF2+/Hv7vX8/Pfy7uno6u/4fnv/+fv7+n57dnV3eXx9fHVxcnj++PX5/3z/+fj49/X3+Pr79/Ly8fP5+f3+/P39/X54dHBvdHd4eXZycHN1eH19fX1+/Pn29vf6+vr7+/f3+Pn6/37+/ff08/b4+Pj48/Dv7u/u7/Dw8PHz8fLy9fz//f39/f17dnd2c3R4d3R0cnR5enh6e3v//np7/Xb77XhvbevibF9y4vBo63tP+NtdbeltXf3pcXzlblV16Ozt+v5i/N7sbXDwbXLl8Wr5+ml29Xt3+npne+n7dP3+cvnu8vj57u76ffb7+e31eHR7d3h6cnR0dXBwbm9zcXJ2/Hh6/Xx6eH1x+/p9fXV3/vh1fXpzef54cv14a3N8dHP8enP7/m94/vX2d2756X3o7udTeMlxcWdRWObS12xOU3XO1lJj9ez5Z+jl9txoUvfG2lFc4FlV0dZa7N5ZWeHfZvt9ZPZ36u5n7mtTYtnb6+11Z2tYWt7M3Vtec3LX0GFTX2rp3OV9aF1k5+X13/xVV2Vg9dXjbGFYauH2c/NvZuLbe+vda1145djQ23Zmbv/p4OXi5PJx7N/p4v1kfuDn5OpqbOLn69vtbfbq+n39du3f92RmZWryeXB7fG9tfO3veGtqfu3k6fDwd/39efDu9+zy+vTq6+jvee/d3dzj6ejz8/V97Ozl72NvYXD+b/FuaGRq8flVbnRj5fdReupN9N/oVNfTXHNM5M4+2li8Szi0PcVKP9PUVji+8V45/s5IyT72yUjd6th9X8NTzNzK0lteab1m+8/J6ETdTsPORMDxbWNN0WTJUU/e+dTd30/GyXN44M3Z2FtfzN1MX1VhU2FZSXRMSktFU+jcT03c/Wtu+uPrdGHY62N83upf53Vib1hw+Fxd/+tkWnvq/3xve9fX3NzZ09nP3OPV2M7U6vDh5//v3/Z8/W9+/WddeP977fn57enz9eTg5u727uzzaWhwbHRmbGtgYGBnX1xw+fbtampr3vFa2GBcxstlTl7U3+fU3HpwaPvlbF1Uc9pWb9ZXRU/i4nNvWFbWz2FX6N3Y3XNy8d15SlTPznRNSVzu31tMaHX05O1wZft4b9/Z5eLrePPm63d3/+jZ3/phYHvu8HFobvn2cWBhanHj53dy+f5mfunr5+Lq/m784+Dubfrh+mdtb29uZmh2enJqbXFscHFzcn3r63du+PD2+3347+71cW5u+er1cnL08nx4+url5/H78Ofr9uvf3uXr7e7r5uv09fj39fp+fXt2cW5tbnd2a2t3/nlxcnr79Pp5dXh6dnV8eXdvaGZxfXBpaG1ubGtrbnF3/f5va3B7fXx6e/99ent7/vt6dXv//P5+fv739fl+//z6+Pn49fT19fXw7e3v8PDv7ezt8O7s6/D48e3v9Pz6+318enh4eHZybm1vcXBvcG9xc3JydXd3dXR0dHV3dXNzc3JycG9yc3Vzc3Z3dnN2enl3dXZ2eHl8e3d3fH17eXt+/Pz8/Pr4+Pf39vf7/X58//38/f38+vb19fPy8PDy8/P19vX3+fz9fnt6e3x6dnR0dXZ1dHR1dHNycnJzcnJydHR1dnd4e31+e3l7/318fHx9fHx6e3x+/35+/vz7/Pz7+fr6+vz7+fj4+Pr6+/z9/f39/P5+//z8/P38+vv7+vn49/b39/f49/j5+fj5+/5+///+/359fHx8fHt8e3l4eHh4eHd3d3h4eHZ0dXd4d3Z3d3d4eXp6e3x8fH3+/35+/vz7/P7//vz7+/39/v79/v/+//9+fH19fHx8e3p6enp6enp7e3p6e3x9fX19fn59fv/+/v9+//7+/f5+//9+fX19fX19fHx9fn59fX19fX5+fXt8e3t6enp7e3x8fHp5ent6enp5eXx8e3p7enh4end3dXh6eXh7fXx7fXd47O/tbmX0fvfh7Xp2bu/t7+lwYvvg7nX69vd27u3v82pjb+zu4ur26l5m6OXp7Pt0fu/mfvLj6Hd992nwbHZ6auJx8O/7dmr1Z2l6aW162+zr3G5mW/X3VNtcds1g/uDs5FtUau7RdfVfX+df6mpzalVY8WRgY2La7Ojk9nhnb3XiYWvZ3uV5X2Ne7NbwW15XWFzk3v5rz9l5UFLcbtbSzdPdu0g+P8ituD8wJ0m30dk0Z1L64WDNMjhH07Rrwdo/6lTLtWM+bDdH0NVx4E5LVr4vPrQusz5BuzW73bj6T81NTNbQzMTta2nwPv/I2MLOTUVkaHrCVsK/R17d2MvXzNfg1E5a0d2/3t5gUWlNd9vT1W9MW2Lh7ehfVU5NYm7Y2vddV1JHa2faxe/geHXrbt7u0drs8GJw387zZ35mVW927trs7GpqVGr74dLj1vbn8+fa3Oj07/vj3tru5+9oa1hbZ/rp5e1vYmr89el+e/H0fvrn9/f9bW17dnRyY2VuXmBdXF9hYV5gXVxha2t5aWxr/vrw7vDq6e3v5+ni5e35e3p+8ff/c2xraGdnbGxtbGhhZmlra210bGtoZ25tcHBnZGJfZ29uZWRfW2FjaXRucnF1+n308u3k4uPn6OXi3+Pl6O7q6+zr6/L8dm9xdXd9fnhycXVwcXh8/Pz9/fz18evv8vL++/r99/T1+X17dnt6ff53eXZ3eHx+fvv+/f/9/f349vX49/78/P78fvz/e3l3e3n/fnt9e///+fTw8PDu8O7t6+rp5+bn6Ojp6enq7e/z9ff7/f96enV0c3J0c3V1dXd2dnZ2d3h5dnV2d3t4eHV1cnJycHNyc3N0dXZ5eXl6fP79+vj28/Hz9fX39fb29fj5/H59fv53eXt9df33aHDq7nFycvbzfHp6+/L5/Px2cHj6cW/r7XVrcP56dHp0bm96cG5wb25wdHBwfftsa3JzeHf9enZ3enn+8/79fXV1dXNucHJ1bmxta2hpbnZ5eHN0dXZ6fft3fvV7enV2d/r79PD7evLtfPrq9/7tfmb153Fr7v1maH5+bOju/fBre+7wee1z1UZjv05nQ8q6PsTLNnLPRk23v0nYzzhpuHxHRsm+XX3D2jhIw93PyF1IbW4+7btUc8dsQn3HZE7Y6V3U6mXk3ltV78TIWFjgZETqxWRd0/Ng3Oxjd15QYtlr8s75Vltv7vR2dv1fW3pz6+VreeDuYFdj+GF73m5k9fZoXmLx4ex0e/piZuTf7ejoc+3r/u7u+nb57+zv7eTofXd8e/t59urv8+re8nfu6vN29fB69uLe7ezr/f1vanP57Ov6d3p6+/r793lzcHR0ePbw8P34/3X8e/z5/nhucHb++X7+/Hh1cW5qbnx5end78/j4+f19eXVyeP788vH2fnBsa21uc3hycHFyc3JycW9ubGtvdXz//n53dXR2enx8/Pn+e3x+e3x9/3p3eHz//vz+/fz+fv38/fr3+Pz9/fr49/f7/P369/t+fH17eHh1d3x+e3h2dXZ4eHl7fH7//n7//v79fv7+/f78/X18fvt69vl28up1+vr5enfr6fDw/P7v/P3+9Ojs8eru7ejs7Ovq5+/u6evr6u7z6+3x7+7t9n3x6+7s7fH88vV88vj+cWl1/XpsbWhob3V1bG5qZWVqcG1nX2Jqbm5tZ2BkZGZqbG1kaHBxcGtubmhrcW9xc29tanf8end0eH1+eP7z+v59fvv59vr8/ft+9+7u7vf1+vfu6+zx8PT69evs9/t3fPTp7/z4fvTr7Pbz8vr7/fDt+/16fvj47HD38Png4nXv6/Nm8eRVXN/d5NreUmZcfM3KzldSW0/e2Xf+Z17X0PpYUvLr1tDs5Vvrzl9be+DZYd5vceRQcdXR1k1K+sq7Xzp8ffvIdMTZMz5L5Ky4RTZjyFtTTVH/zdZRz8s/P9rR0mZDO9m62VFm1GlL+d5YS2l6aMtkOFTByVhZVkBfyNz7ys5CQO5gVej8btfWT0rn1XFX3+tUZeDf3tH/RmTOX0/x4N3R3FVT399f8NDb6+ZvaujYcFtwZmTu2tvd2OVmXW1hYd3W6uLaemb0e3Hs72ln7Nnm6N7qbnV3b/rl6PXg3PJncGtq6Nzp/PBtb+rp9vx2ZWru7O3j5/lua2xtdH3x4+b9Z2d2eHj9fnJpbX3z6/L6fHtzbm51+fT0+n12dnFuePL2fHV99fH1+v99d2hs//Tv8fH4fXVudHv6+n79fnt7+/X4e3V0eHd1e/729XhxcHR2fP1+fnZvcHJ4eXJwcnp8d3R2e3x1b21sbXB5fn51bm1tcHJ1eXp4dXh4eHl5eXl3d3V2eXz+fnx6dnh5fvj09Pr/ff75+/18eXp7//z9+/bz+f96eH379/b3+ft+fv/8+vv+fH5+/fr69/X3/P37+vj39fTz9ff4+/v49PP09vXy8PH19fP09/n49/Tx8PHy8/T19vj4+Pn6+fj5+vr49/n8/Pn5+PX19/j6/Pz7+/r4+Pn5/P59ent9fv7+ent6dnZ0c3l8eHRvbW9xcXl2bWxua21ycW75e2t8a2T9Y2T7/mtr3mHnZUfF1lbkSlPO/F/e02RJ8txT49pWXeDT8npUWOHfXmfSzl1UdOZuUdvUT3zLZGfRY0vo2lXgzlJY0vNU7tDd/nVbXnts/uLa3ft37O9fYO3+Y9nWW2ndaV3h6m3f5V9s6GZd7elt9Ofu7fJrbHZudPPs6fRybnt6+t3pZXnvZV968uze6njz/mBkdGd54d/p8XBpdXZx+/D/+/L4/Xh39/l5dfp3b/7+dv76e/vzfXt3bmt29f759/x3eHdw/PL2+nxvc3pwdvb08O35eXhua3R7e/j1eXzz/nv7fnh2eHd3/vv69vl7fH59fnx4dnh8fv3+/v57dnR2eXx8/v59fXt6fHx8e316eXp6fH7//f98fXp3en1+/v3/e3t6eHv+/H59fXx9fn5+//z+//18+v55/vr873R173z79/z7/vr0e3v5efT8+/p++H58+3x5ePTz9/n2+/Zx9ePw8Ppz8Wfy3vDjb2x+aNvfdflnb/D16+3+cHD07vf2eHlwe+/v/HtzdHl5/m1yc3X19fz2dm/67n1ufG9tcPV7/2t2aHxzXu5nbG3r8ulb3HFu7trHXOteSOlwfdtdXGtp3fjg/Hznb+LsYXtVcdvu+XLl49l2b2RQZN9tZ+Nu8eZia3ta4dhl9FN27WzQcU280Do4OMa5T+2pqUoxHy+2rpk1It4xr75Ywik2tca5tz49QEJsN73MLs/E6rezSDFY0m7zums43etDX72+S0n5dlZgy9FoxV4+zs9Pv7P2TH1+QV/DVE3F2PvudVhPx8pMVPVwTnDSYVJw31lp017kytxw6c9ecM7uceRgUlpdbu7zWVBhU2DuZuX5Yefm+XPa3WX9395xduPu2tvn4VtS4e1h8Hle9up9eHDo3N7c2/3g1tzb7uX0feHs9PfudFtxXFVjY2ZgZGhdanxeXmtmX212Z2r16vZ5+Wxq8vX5e3vu8O/ueG95+nh3/XT47uf1en559vX6/fz/9PT/dXJteX5rbmxv/nl7amNobm1pcHFsd3ptbXL2/n59dPbt6ur0+PP1/Px8ePXu/Xp6cHJycXh7c3R1c3z9/vl6dX56fvrz7fDv7/H3+fb5+Pn29fr69e/w7/T/+/Ly7vHw6+vt8Pbz8/D0/Px9fP5+eXd3dHJubXFvcnNxcG5wdXV6e3z7/Pv29/Xz8vP19vfz8u/v8fL08/P39fX39ff6/Pv2+Pn9ffv/fH18//v8fnt8fXx+/3p8/f59e3z/fnx7enp8/n5+/v9+/n1+fv7/fH19fXx5eXl7eXZ2dXV1dHZ1dHV0dHNzdHV0dHR1dnd4eHp8ff9+/vz8+fr8/Pz7+/z8/fv9fn79/v79/n18fvP5dvh+eO59evv8fX14d3B6/nZ6eH18eHd6dHV4dHd8eHR4dXV2eHlzeHlwc3xzeXh7e33+/3f//n32/fr8+3l1fXj/dv58d/54/nZ7/f358316+PP1+nz+8+rp8P1wbH399vb59ft9ev97enb8/fn6/ntzenv38vT5+f10fHt78PHu9fr8fvxxfHvu7/H6d3ZpdG749vHwbHRo+2p5+v7xdP9+e/Fr9+T55GzUWtZdfO9Sx1jUZmfbVuZM02XcX1/WWe5P6fBk3efddVtyaetw7Nxq92bpbGVr5OVk+ProemZs9uvrd9vm7XX783rn69zm8P/sdGb+7vB8+OnndGtnam5y3ubtemVxb/h5e29nc3xvbW9zcHFvdPb4b2p0am/7evNyeu54bXzv9XB79Hr072p6bV522ev89G5gYnTg39/r9v7m4Nvt8Htw3tv5bnR9a3ni9P33bG/x6uzu9vPu6/ry7ez7cHfu7Xr9+3Rq/nJw8Pt0anBtanBua2tzdXFvcHVvcm51dXF4eXZwef59eW1va2hrd3ptamtpaGZhYGViaGlsdfv0+fr49u/q9u/r9vfy9f37d192bnBxZWpv02JbfnjP3PBU2O5m79HjVOvH6tLuUF9tVdjb9WlsXm1w+up6WGXY+vB6a1hkv/j3yGNEYN314tTtYuPTaGdhZflpc+ll2N9R7NfXT2HL53LbYlrl2eDf1+5ddV9uU1l4SGLG5WbvzmxIUXrazm1TfNjfYVp+6W918FBKU1pd/c7M1tt7amhIS9/Jyezs2m1QXOzfbW/mZFpnW2fSy9Da3OhqY1xb+tPO5X3e7GVVWvLi93bv7Gpi/d7c4tzecGJybFVc6t3b3/RxY1tdd9/n/n3y7m524eP4/uztY1tbXnHv6uvzbm15a2Bo+Ovr7fJ9/Hd88PX9cGlsbXBvdvxwefb0/XNpYGd29e77eHlwbGlqcnt+eXt7c3NrbXf68fp3b25tbG94+PL8eXNwdHp9ffv18vP8+/b7+vPz+P9+fX5+fP7+9/f39Px7d3z9+vb18/X8dXV++Pp+fHv//X51dX729/53cXj7+Pf19353dXh9/fv6/H18//5+fHv+/f9+fHz69vLv8/n9env89vj39/b19Pf6+/j19vb4/fv39vTy9Pf6/3z+/Pj7/33//f/+fX38/Hx6eXl6fnx6d3l5cnV2eHp4d3Z5enh0end2d3F1/XL9fHn6Zmbqenrxdf1xaW73eXrzbPH5a/95cPTq6Vto2fB+5X1z7fhqcHVs7930cWJt9Gz53/FsbfVbV8lvTdjm5NvvTlHRyG5a6l9f6XHn4llna17bfFf2X2fV12xRdN5b/Nf4ZV5fed/0XmJnaX7j4vVtbGZm+OTY4F1gcGryfWZydH7u92tt7n1w8ufi7Gdg9N3s9tbhW1hfaXXr4ev5cmZodXv19Hhy7+Ld53r9+mlu5u387/lr/upoYv1xa+jc5/VwYG7n4+rwfPbv/Hl6++31Z3Hr9XPv4/10+nv95O1tfO57cu7vePX1dnB9enJwfe7zdnZwZm97a/zn+2xye3Xw6e9+dHBwd/Xwc3bw5u90aW7v7+99bm9vaGpraWxybnX3/n5yZ2pqamty+/Pt9fj09/j89fDt5eHi5+fo5uHd2uDg7N7c1dTe2uTa19fZxdJdSlDFwd1UUFBVy/5ST1JzWPDNXF1NRtjf3XNKZtzrbVBKZl/hamjfQzxP6epi/lzgy85hP07i2tX0TmDxXHJe2VtCYGZ061xNVHjO7ljmdXrX331Yb+dw3M3c5s3abefV1tHY6Pzn3t7W3t3T4/Ttcd7P52No+dXP2XdcaWprbuHsXfba3d/WZElKaNVrVt5QSbzMOlbZTlnA7DHltkdFwOtH2cVwUt3uTFnvfNTVclFbz9hX9N1NS9fVSfDIUVzI91TQ0kxS2Pl8y8rm29vwYlhj/PJx6d3h3PFPUuvn59DeXnz6WF/f8XvjaVZkYFRdemt0cVlfbWhu/XZ2enZnXV9ob/nj4eXw+XdjZP3j5u7l7unb6mpycWv05fZ7em1lZm57eWdeX2JgX2Foa2hobmdgY2hqcHt5b21tbGtweHVubnF7fXhzefXs6ezv6ujp7e/w7Ozp5OTm6Pd99fDw7e3z+//9/Pbx7fH3d3R0eP348/T08ff9/vXw7+3v8/b7//3z7e/5fn78/H55eX19/np3dHFzdHV5dHN1dnd2d3Z1e/77+fn8eX349vT6/v78+Pb08vHu7u7t7ezt7Ovp6Onr7u/u7e7v8PDw8fT6+359enR0dnd1c3JwcG9ubW5ydXV1dHh7fHt6e3h3d3R0d3p7eXp3dnZ0dXh6fHt8e319fn39+vn5+vf58vb6+fv/+/z9/f9+fXl7e/trffRl/e11c/l3/vPu+np9dH7u8Pf3/fzz+vj9b3R8ff/4emdmb29qbmxtcHRta25wfHdudH53d3pyc3V2cXn6dW9ycHN3eHlye3Z1fHl9dv57dH78+fny9/zw7e3y9Pb6++/1fvXx7vxyd+/49Xhtdvv2eHlxeHJucX35/f12//f/93x4/e/v/Xt8+Pny+Pr5+/f+dnt7fvn7+f15dX39ff79fH59fPv9fn1++/35+v76+f1+fP/7+fn7+/739Hx+9Pn8/Ht4eX56eH19eXhvb/h9fnlvcHL4fG50eGp2c2T07Urj30a+zDxRaXjL6N5gR87aY+ZM6tBKd+LcyVlRWFzb3tXZT2TOWVfeeeTL7FBpztheUU52zdTl6EtM8ExP0c/XfFBNUOvX3ufx+9vddWhaX3fi0Njc4mVeVF7U0NnX52R23u1819Pwefjy5+Xl733cz9Te8GFbcuje2+D5Z2Rsd/bh7WNofG53e2l16fBu+Ozo8m1vY19793Nx+ul8fOl+ampaX3rj1+b/a2Nw9uzn7mtpa3F3+fvsc2D7e3x3bl5ebPLt/Ph+b2RwXVtua+57/nBtXulgfVzxWV/U3V5u6mzez3d+91Z47kREsjFMqGatJUQwvqjQ0zwsP7bXuDhfe8fH58cyRmS41MlRUL/MXsq2YlE5Rtrv6dZd7cjfU1FEfc5UTk3Wz87Z+V9TWFBnZOHb7Ff1STxVWOd+71dvVkdbbXxqZ3hs6dXRzNDod29zbNzb7NPM0eP0YF/n6W73bvnk3uJ47XP84Ojv1tXY0utpfOn35Nrt6eHt8nRqY2f7b3t9anDt6vjra3Pu5/by6fvl5/B+dHJ28m5taW5zYWhmZGhtZmVwcXV4dXl8fO/58/Dr5+jn9Ozn5ev0/nd3ePf9+m9pamtmYWReYmhnaGVgY2poZWRiYGtubWloZ2JnZWdpbm5wbWZna2xueHf9+/Hq6ubn5Obl4+Pf393d3uHk5uTo6/D19vp5cm9wcnVxa2tpa2xvbW1wb3Fze3x+enh2eHl6fHp7d3hxcHBwdHR2c3V0c3BwdXv+fX7+9vPz9PT4+vj59/j49fj3+/r7+vv7+fj3+fPy7u7s7Oro5+bn5efl5ebm5+fn5+rs7/Dz+Pn8fnl1cnFvbm9ubm5ubW1sbG5ubm5vb3J0c3J1dnR1dXRzeXh0e3Nv7nts7/d9+Xx79fPv8PLs7e/w9vb28/D2+fL3fX3+fv//enp6e359/nhvfvp++fl4e/7+/H39fnn+9/n7fnVwdnx9+314dnd5eXd0eXdzdnd4e3VucHp5eX14cnZ6eHd4eHN0eHh6fHl0cnN3dHZ5d3d4eXdzdnh3enl4/vr+fHp6fvn2+X79+/39/f////7+fXx9e3h5eHp5eXh1dXd2dHZ3d3Z1dnh6fHx6eXl6e31+fn59/vz9/v79+/z9/Pv7+/z9/fz8/Pz7/Pz8/f38/Pz8+/r7/P3+/f7+/v7///5+fH5+fn5+fn19fXt9fHp8fHx8fXt5eXp9fX1+fH18fHt++n5v7u5jd+Z7evFzdv3x+v7x/O/x8/j983x7dOjocPD3enrw8PHk63Vy3/1V1+lh5eB88Ox3aGLp8ujgaW9rcPpx6+B3Yvl+dG3uaF3j6O37YVpm5fhq8fd3bGhvd/f483Np+On3e3Fi/+rwfX3zYnTlcnNx7fZ97+70dm9t+ufwbH38+Xnoe0TwvupzTEzEzsD1P+D+7L7Z5k9X3vPuyNdYTlHR0MbfW1Dy7fbQ9Xrk/Gfkd+ldT97oWWlTXHBdWU1ddXn0Z3xTT+7Y2fpTT1fizPJZWPvO2mZkbOnb4dbS0uJ1eO7r28/d38voaWn59uPX1tBv6fh6WFTtabzeRs9iT2b01fBa0NxSTVbNVVzfTMzb7l9NV21u0l9f7Gb7X1tYS0Dcyt1aTVROd+XZ0mReTGNbZXz31V/P1U9JTWjf1Nf9X8HTS3reWdTQ1MPoWW9YYNDOVlG8yV7MRTBXzUK+pu1BxUgu+tBdzsxdR1djbGp6zdFUTO1APdVWQMC+P/jDPDnc/T3WxFFyx+hq1mFOVVlVcuHt3lVFZ2xj1OFOXnhOWcvS5M7eXf7XeP3O5mzX4nvv9/TX1Nvf7HlbaPpx8N7Y1djz3tp1dvxsb97d3tXfenv9ZlxpZml2bWxvdXrp8W5sbGlna2/w5vdz+XJne/f04ebv7ntqZvjq5d7ue3lsav14aG5zZ2Zz++38dnRqZ2p0c3Xv7/v7cWhpdHdvb2Zfa3ZuampoZWRfX2dqfPnx8fp9fvT69ezv8+3z//js7314a2ptb3R7+Pz+9vn7+PXw7+70+fXx7uzt7/X6+vv4+PLx+vx4dnx7fP34fHJvb3FxcXj+/H14dnN6/X58d3JxdXl2enZxbmtsbW1ucHJucHZ3d3V3fvz9fHz88uvr6uru9fbu6+rq6+zu8ff59vt9e317eXn98Px97uf5evn47+rr8vTw9/jx7vlxb3x6bnN1cHr6d252dW5vd/v3e3v9fXz5+f57d3j9/np5eHBwenNyenVxcHF1eXd4ev56eH17fP77+vr2+Hv69Pj19/b7+/b3+vp+/H59/H57eX19/n7+fv3/+//8+3t9/f59ev1+dndxcXp4cXB2eG5z/3Nx9fhwdv9tcvL9eG92//13bXz/fm5g6NRwT2R159vfYlZ3/W/e2/56Zl/34eJ3d/Vwd/796m5p8H7s6Gdj8ul+euDoat17Tn3J7WX2dXvxdlxu4N7ob19gcvjsa1ht4eXk2XRMXOvx6Nr6a+Ph/Hp1W2Hp5uvm/Gh2anDp9/Li4Ov1dWvr3PZ29HludG9obvp99evt8ndgae7j4drb5PtgWV537uXf6f52a15icfTd1Nbb4/l4+vz35uLp/mZeYGdrdvf1+/j/ePXs5t/c3uTtfnR0d3V4/fx5bGRiZm787+zs7fH7fXl79Ovp735wbGxtb3V++fj7e3JwePr08fX9eHJwcHBydXVzb21sbG53+/Tw8vb8/v///Pr3+Pp8dXBub3BydHZ3eHh4eX39/Pr59/f5/P3+/f7+fn18enl6fH5+fv//fn59ff78+/v9fnx7fH1+fv/+/n5+fn7//v7+/v7/fn5+fv9+/35+fn19fX19fX19fX19fX5+////fn5+fn5+fn5+fn5+fn5+fn5+/37/fn5+fn5+fn5+fn59fX5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+/35+fn5+fn5+fn7/fn5+fn5+fn5+fv9+fn5+fn5+fn7//35+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn7//////35+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fX5+fv///35+fn5+fn5+/35+fn5+fn5+fn7///9+fn5+fv9+fn5+fn5+///+/v//fn7//////35+fn5+/37/fn5+fv////////7+//9+/37///7+/v7//////////37/fn5+fn5+//9+fn5+/35+fv///////35+fv/////+//9+//////////9+fn5+fv///35+fn5+fn5+//9+fn5+fn7///////////////////////9+fn5+fn7/fn5+fn5+fn7//35+fn5+//////7//37/////fn5+fn5+fv9+fn5+fn5+fn5+fv//////fv9+///+//////9+/////35+////fn5+fv9+//9+fn5+fn5+////////fn7/////////fv//////////fn5+////////fn5+fn5+fn7/fn5+fn5+///////+////////fv////////9+/35+/37//35+fn5+//9+fv9+fv/////+/////////35+fn5+fv//fv9+fn5+fv//fn7///9+fn7/fv///////////////35+fv////9+fn5+fn7/fn7//35+fn5+fn5+//9+////////////////////////fv9+fn5+/35+fn5+fn5+fn5+fn5+fv////7//////////35+////////fn5+fn5+fn5+fn5+fn5+fn5+fn7////+/v//////////fn5+fn5+/35+fn5+fn5+fn5+fv9+fn5+fn7////+/v//////////fn5+fn5+fv9+fn5+fn5+fn5+fn5+fn5+fn7/fv///////35+fv////9+fv//////fv///35+//9+fn5+fn5+fn5+fn5+fn7//35+fv////////////////////9+fv9+fn5+fn5+fn5+fn5+//9+fv9+fn7/////////////////////fn7/fn5+fn5+fn5+fv//fv//////fn5+fn5+fn5+fn5+fn7/fv9+fv///35+fn5+fn5+fn7/fn7///9+fv//fn7///////9+fn7/////fv//////fn5+fn7///9+fn5+///+//9+fn5+fv///////v7+/v7+/v7+/v7+//7+/v7+/v7+//7//fz9/f7+/v79/Pv7+/38/P39/Pz8+318d3v79fH6eHBvdPj++/l8fnd4ff/6fnx6//n29vj2+vLy8+z18PPw8Pjt8/Ht+fj26uzy9vf5fvh78Hv4eXX8bvdx/WtcWln4dV9mcHR+eGj8amt3cvBp49106vd3eHBgW1va2vw/Tbc3/LwdXKvUrk83Sie0rC6rxCvAOXC4Ma9JOqA/PsjUPi2ooC85uEszW7i7ba7CNzkqOcbE7OrJvmItZM1AU9RjyrXQVEZIRFW3vj9XckRBX8zxVtLZYUNPbF3q0s7O4F3t9OTRfGDPzNngXl1a/dvS32hgVFb0eVpodtzc5N7k19994Njj4cnP+v/b3NjV5ulbXfVnXPJ67s7zVVdqYVx2cHvl5PN4a2Bt5vXu437v+Gd2dWPy4Xjy4ndn+m1qbnbl2N/g7nHt5uDh9fXu6uHwfO7u7mVdWVpmb31iVVldWllYWl5lYGZkX2ZrfHl6e33x7u3y9fb09fbv7v/47m1qbW16eHxqbHBpb2tuenr1/21qcfTx9v19/fT4dnx1bHJ1d3R1/Pd5cGxwcnH//O7x9O729vPx7vPw7u/v8fL2/Xl1dnVyc3FwdG5qamdtdG93dXJ4d378fPbw7u337uzr6evr7u/r8O7u8Onq8fPy7+7z8PDy7vDu7/Dy9vb3/Pr7/Pl8fHxydXBvdG5sbW5zcHJydXV1enl++PLu8PTt7e3r7+7t7e719vX29fj/enh4d3VzcHFxbm1tbXJzc3h4en3/+/r48/X18/Pw8O/y9PX4+ff39vn8/v7+fnt7fH1+fXx8en79fnt6ff99e3h6enh2dXV0cnR0cHBycXBydXZ5eXV1dXh6en78fv//fH58/fj+/vx7fv96fvz/evx6bG3oeVvh5WX88WRv8vD9b/h+ffp6/HRpfXVz5O9kbXZna/V8bvX7aX78a3d+d37t7H51c3J+fvXo9fjyeGx3+n315nxveGx0eHV+/vx6bndsZ3l5dvTs9Hh4c2/5+e/s9ev2cnx4/PL07Pb69nR7enf37uv3/n5ud/b78uvt83v+fHL8+Pbu8vL9dHh1ef/58PPy+XB0dnbz7u/v9vl2ePn/8urt8fr9/X728fDt8PP6fvl+/PLy7O71+Xj/ffzw9+/s9Pp9eXx4fvr9+X17d2x4dHny+/v+fHdxb/p57Nzq6/lsZXTTZ8x+Xtpca8dQTc9d3tpkW1XsbGnnaHLTW/F+T27oaef6/XBXdl3o4Vtf4+BX5P5SYXHp0HFpblZpXHje7/VuaXhk6tv0a3v67XNxc1n97XPqb25sZ3h6cOXuZV9r8OLa83hqZXDxfejxeOL1d/tyZGv15G9qennr1tp1amHv1+zg6nxv6e9qZmBoeOvr7vxcY2lg1+7X31TvS9lazUTCsTDSPG/WZ8nR2lE/y9PARmzFStrPv8g/SuZX783T4k9OV1PkQ17MSWpL3ltN+PtZTPvleUpnzFJgVe3RY3Rh6stdYMdVcd9r/uZhWFJg9PNOTbpNu8AtpsvNuS6eYTqmOz/NuvhhSzv9X1lCadkvOrpXQkZGStftQk9lyEjev2ZZNMO9Ucj6N1DDP3bLPUXWdjtkvGJExcVh3svr1MDc19/P1UjCvmNf6+Pq7cdaQs7SVdnHd1fa0OTS/klpydpW6X1QbuHaXlLsY1fu2ltgz9jv4ORs4MzxUevZW1V2bltlUkxcX0xPa2FXUmnl7+jp6uHV1m7+5ene3dbs/t/36tnqcXT3dXNkXOvuYFtaWWllWFhnZ11hY2xx+nv+/V5icHT+alleaV1YYWVdY2BaX2xzcP3u/O3s8efg3N/h29zi7N7b3N7n+enoffrp8P57eHZmbXR1fHNqZnzu8PPs9fj07vXy6PDw9Pr89v19eG1tZ2BkamttdHNubnR88e34+O7p7Ovk5uns7+/6c3l1eXhuZ2VoaG1vb29wdf//9Ozq6Ojn6OXk4N/f4eXk5ezu6urs8f55e3t5eHV2bWpucXF0eXp8/Px7fvr39/f6fHx5d3p0cHBtaWlpamxrbGxpaW5zdXl++PX29O/r6uvs7Ozs6uvs7fP1+H14d3p8eHVxcnR1d3h2dnd3eX78+ff2+Pj5+Pj38fX7/fz8/X56d3Z1dHR0dHh6fHx5en36+Pv7/P1+enl6dHBubGpqamlpZ2ZnZ2ZnaGprbG1ucHV4e/7//Pn49vX18/b6+/r7/f59fX19fHp5e319//78/Pr5+vr5+Pr9/Pj3+Pz+/f39/3t6eXh2cnBwcHBwbm5ucG9vcnN1en5+/v38+Pj3+Pf4+fj5/Pv8fn1+fHh6fX18e3t8e37+fv/+9/j5+fz39/b1+Pn28/L39vj6+37/fP789Pv4/nf9e/N7+f1ufvBoe/ha2vZcfvXfaVjq+mza+376Xnb48+jdaXRqbuHe72v26/3u2fd27XF94tt5Zefoaezo6exsemln4eX6fXH3c//od3ZyX2Xr6PNsZWFe/Hzq83ZdXWx19H18efp07fxx7f50/+ne6fDz//Tj5N/o+vn7evns6Ofv8/j38PDu9v7+9+/t6/H5/Xd79+/2fnBwefvz+/P4+fj3+PPx9vb38O/s7vP5e3b89Pf/dnFyent7fXx6c25qbXN3fHVwc3j+/Xp3c3b9fPr0/3v+/fLv/X53cXhxePz+/f35/f93dXJub3B1bnNud3RrbWttb3pvY19eZfvufXz7em569PPqem50enB66eze2nvv3+3/7tv09d7o3unm7O3zaNngcNXg3N3q8Eu+z1ju211bY0zZyV49yLk4OslAz7NG19FZa0VD0OlQWGm/2kx8Tt7NSUq7zFPESDbuzULQvEBM3lRAfW3NzVhYYkxkzVd9wGBF7fhH89lEd8R+WPncYNvnWFFa495wXfb1XOBkT+fVamDlWEx+33fl3Vho12JT6Nj85PBtfXfh19PZ3Or+3exn8Nzg29f5bd7f8ODf/Gzy8W7t3vBq5/dibf57fuxvZ/vu9Xv47vF4cHRs/O/v+nRxbfPl/frg4/Dr8HD06vD17PB0en15eXRzc2pocGplcP9ua2ZgZ2peYGlpa21lY2xzb2xqa3h+e3x6ef34c259//rz+nb8/nN5eXR8+3hydXFvcnNwbWtqa29xc3d4eHlycHd6fvj3+vz+/PLw8vHw7evr7Ozs6ens7/Dx7u3u7/Hz9ft+enZ4eXh2dHFyc3BubGtqa2trbW5vcG9vbm5yeHx+/vz59vb09fX08PDx8/Dt7e3v8O/v7+/v7+7v8fT29/f2+Pn5+fb19/f09Pj6+fj49PPy8fL09fP09PDw8/Pu7u7u7O3u7vDx8fD39/f3/Hv3e2rw8Gdn+25nfHpjavdqbHVmY3B0ZnVyZl5sdW16/HxjcPXz+/rteHH46/fw7fl79/R68O/68+z6/+/0ef3sfnP7+v378Hpv+XZ9fnVzbXV3eXBvb3JpbHBw+nVpdX1saflubHjwXXZy8Ople1/a7GL5a+117Hd1bu3+cexs/XBr53po3Ghg13J+/3xzdOL7+Pr0bfDpaf18fOjyfXZ++Gro/v3y/Olm5VXC/kDFUOfW7NNS9f15duht3M1g7nNh4ODc329YXeZq8X1uVMfWQtHUPt7IZW3UUunsWGNt2nLg7Ulb197j9Fd33+5ebuDq6fJPZeFT8M1kUf12XNPeW2Foe3lucF7g3mLs61xbbG/07evoWHPga2vk62d9dWhd9Nh69uL2WW/k7u/z7Hd77mVx2N1s/npi8+L+bn36/vZ3+HN94uBybn5bZtzrbfPje3zwem7y4fX7/mt48ujl+X72dW9+9nvo5f5v/vn+6fBycv7+d3Z1eHz5+G5pcn10fHtvaXJ8bG94ent3b2ppbnx7dnh2b3J1cnf5+P1xbXB3/Pn+fH55fH58fHf2/Xp9ent79PZ9+v96fH3+/vz39/3/+fr79Pf7+/j5+Pf49fP0+fv69/Xx9ff3+vj4+PX19/n6+v77+v36+fv+/v1+/vx+fX19e3x9fH18fX17fHx6e31+fv5+fH79+/r6/P/9/f77+fz8+vr8+/z+/f3+/n5+//7/fHt5eHl5eXh4eHh4d3d3d3h6eXh5eHd4eHl6e3t6e3t9fn59fXx9fX5+/v39/v7//v7+/f3+//79/f38/v/+/v/+/f7+/f38/Pz8/Pz8+vv6+vr6+/r6+fr6+vr5+fn5+fj5+fn5+fn4+fr6+vr6+vv7+/z8/P39/v7+/37/fn5+fX19fX19fHx8fHx8e3t7e3t6enl6enp6enp5eXp6enp6enp6enp7e3t7ent7e3t7fHx8fHx8fXx8fX19fX19fn5+fn5+fn5+//7+/v7+/v7+/v7+/v7//v7+/v7///7+/v7+/v7+/v7///////9+fv9+fn5+fn5+fn5+fn5+fn7///9+fn5+////fn7///////9+fn5+fn7///9+fn5+fn5+fn5+fv/////+//9+////////////////fv9+fn5+////fn5+fn5+fn5+fn7/fv///35+fn5+fn5+fn5+fn5+fn5+fn5+fn7//35+fn7/fn7////////+/v7+//////////////9+fv//////fn5+fn5+fn7//////////////v7+/v///v///////////////////////////35+///////////+/v7+/v7//////35+fn5+fn7//35+fn5+fv////////////////////////7///////9+fn5+fn5+fv9+/35+fn5+/////////v//////fv////////////////9+fn5+//////9+fn5+fn5+fn5+//9+fn5+fn5+fv////7+/////35+fn5+fv///35+fn5+fn7/fn5+fn7/fn5+fn5+fn7///7+/////////37/fv////9+fn5+fn7//35+fn7/////fn5+fn5+fv//////////fn5+fn5+fv//fv//fn5+fv///////37//35+fn7//35+///////+//9+fv///35+//7+/v//fn5+fn5+fn5+fv9+fv9+/v7////+fn19fX5+/35+/359fn5+//7+/35+fn5+fn5+/37////+//7+//7+/v9+fn5+fn7//v9+fn59fX5+fv7+/v5+fn5+fv/+/v7+/37//35+fn5+fv9+////////fn5+fn7/fn7+/v7+/v//fn5+fn5+fn7//v7+/35+fX1+fn5+fn7//v9+fn1+fv///v7+/35+fn59fn59fn5+fv////////9+//9+fn5+fn5+fv////9+fv////7/fn5+////fn5+fn7/fv////7/////////fv9+/////35+fn5+////fn5+fv///////35+///////+/v/+/////35+fn5+//9+fn5+fn5+fn5+//////9+fv9+fn5+/////v///v//////fn5+fn7/fn5+fn5+//9+fn7///////////////////7//////37/fn5+fn5+/35+fn5+fn7//37/fv///////35+//////7+//////9+fn5+fn5+fv9+fn5+fn5+////////////fv9+///////+/v//////fn5+fn5+fn5+fn5+fn5+fn5+fn5+////////fv////////7///9+/35+fn5+fn5+fn5+fn5+fn5+fn5+fn7/fn5+fn5+//////7+//////9+fn5+fn5+fn5+fn5+fn5+////fn5+//////9+fv///////v//////fn5+fn5+fn5+fn5+fn5+/////35+fv///35+fn7///////7//////35+fv9+fn5+fn5+fn7/fv////9+fn7///9+//9+///////+//////9+fn7/fn5+fn5+fn5+fn7/////fn7//////////////////////35+fn5+/35+fn5+fn5+fv9+//9+fn5+fv//////////////////////fn5+fv9+fn5+fn5+fn7/////fn5+fn7///////////////////////9+fn5+fn5+fn5+fn5+fn5+//9+fn7/////////////////////////fn5+fn5+fn5+fn5+fn5+fv//fn5+/////////////////////////35+fn5+fn5+fn5+fn5+fn7///9+fv////////////////////////9+fn5+fn5+fn5+fn5+fn7/////////////////////////////////fn5+fn5+fn5+fn5+fn5+fv///////////////////////////////35+fn5+fn5+fv//////////fv///////////////v///////35+fn5+fn5+fn5+fn5+//////9+fn5+/35+fv////////////////9+fn5+fn5+fn5+fn5+fn5+//////9+fn5+////////////////////fv9+fn5+fn5+fn5+fn5+fn7/////fv////////9+////////////fn7/fn5+fn7//35+fn5+fv/////+/35+fn5+fn5+////fn7/fn5+///+/w==';

const TYPING_TRIGGER_PHRASES = [
  'note that down',
  'write that down',
  'let me just',
  'jot that down',
  'let me check',
  'checking',
  'let me look',
  'looking at',
  "you're booked",
  'booked in for',
  'booked you in',
  'i can see',
  'several openings',
  'slots available',
  'openings today',
  'is that right',
  "that's correct",
  'rescheduled',
  'cancelled your',
  'appointment cancelled',
  'text reminder',
  'sms reminder',
  'let me write',
  "i'll make a note",
];

function shouldPlayTypingSound(agentText: string): boolean {
  const lower = agentText.toLowerCase();
  return TYPING_TRIGGER_PHRASES.some((phrase) => lower.includes(phrase));
}
const MAX_PENDING_AUDIO_CHUNKS = 40;
const MAX_SESSION_DURATION_MS = 30 * 60 * 1000;
export const MEDIA_STREAM_START_TIMEOUT_MS = 5_000;
export const MAX_PENDING_MEDIA_STREAMS = 100;
export const MAX_PENDING_MEDIA_STREAMS_PER_IP = 10;

interface PendingMediaStreamConnection {
  id: string;
  callSessionId: string;
  remoteAddress: string;
  timer: ReturnType<typeof setTimeout>;
  cleanedUp: boolean;
}

const pendingMediaStreams = new Map<string, PendingMediaStreamConnection>();
const pendingMediaStreamsByIp = new Map<string, number>();

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const truncate = (value: string, max = 800): string => {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
};

const formatBusinessHours = (
  hours?: Record<string, { start: string; end: string } | null>,
): string => {
  if (!hours) return '';
  const lines = WEEKDAYS.map((day) => {
    const slot = hours[day];
    if (!slot) return `${day}: closed`;
    return `${day}: ${slot.start}-${slot.end}`;
  });
  return lines.join('; ');
};

const formatServices = (
  services: Array<{ serviceName?: string; durationMinutes?: number; price?: string }>,
): string => {
  if (!services.length) return '';
  const lines = services.slice(0, 12).map((service) => {
    const parts = [service.serviceName];
    if (service.durationMinutes) parts.push(`${service.durationMinutes} min`);
    if (service.price) parts.push(`$${service.price}`);
    return parts.filter(Boolean).join(' - ');
  });
  return truncate(lines.join(' | '), 1000);
};

const formatPolicies = (policies: Array<{ policyType?: string; content?: string }>): string => {
  if (!policies.length) return '';
  const lines = policies.slice(0, 8).map((policy) => {
    const label = policy.policyType ? `${policy.policyType}: ` : '';
    return `${label}${policy.content ?? ''}`.trim();
  });
  return truncate(lines.join(' | '), 1200);
};

const formatFaqs = (faqs: Array<{ question?: string; answer?: string }>): string => {
  if (!faqs.length) return '';
  const lines = faqs
    .slice(0, 8)
    .map((faq) => {
      if (!faq.question && !faq.answer) return '';
      return `Q: ${faq.question ?? ''} A: ${faq.answer ?? ''}`.trim();
    })
    .filter(Boolean);
  return truncate(lines.join(' | '), 1200);
};

const formatEmergencyInfo = (policies: Array<{ emergencyDisclaimer?: string | null }>): string => {
  const disclaimers = policies.map((policy) => policy.emergencyDisclaimer?.trim()).filter(Boolean);
  return truncate(disclaimers.join(' | '), 800);
};

const formatEscalationInfo = (
  policies: Array<{ escalationConditions?: { type?: string; content?: string } | null }>,
): string => {
  const lines = policies
    .map((policy) => policy.escalationConditions)
    .filter((entry): entry is { type?: string; content?: string } => Boolean(entry))
    .map((entry) => {
      const label = entry.type ? `${entry.type}: ` : '';
      return `${label}${entry.content ?? ''}`.trim();
    })
    .filter(Boolean);
  return truncate(lines.join(' | '), 800);
};

const formatBookingRules = (
  rules?: {
    defaultAppointmentDurationMinutes?: number | null;
    bufferBetweenAppointmentsMinutes?: number | null;
    minNoticePeriodHours?: number | null;
    maxAdvanceBookingDays?: number | null;
    closedDates?: string[] | null;
  } | null,
): string => {
  if (!rules) return '';
  const parts = [
    rules.defaultAppointmentDurationMinutes
      ? `default ${rules.defaultAppointmentDurationMinutes} min`
      : null,
    rules.bufferBetweenAppointmentsMinutes
      ? `buffer ${rules.bufferBetweenAppointmentsMinutes} min`
      : null,
    rules.minNoticePeriodHours ? `min notice ${rules.minNoticePeriodHours} hrs` : null,
    rules.maxAdvanceBookingDays ? `max advance ${rules.maxAdvanceBookingDays} days` : null,
    rules.closedDates?.length ? `closed dates: ${rules.closedDates.length}` : null,
  ].filter(Boolean);
  return parts.join('; ');
};

function incrementPendingIp(remoteAddress: string): void {
  pendingMediaStreamsByIp.set(remoteAddress, (pendingMediaStreamsByIp.get(remoteAddress) ?? 0) + 1);
}

function decrementPendingIp(remoteAddress: string): void {
  const nextCount = (pendingMediaStreamsByIp.get(remoteAddress) ?? 0) - 1;
  if (nextCount > 0) {
    pendingMediaStreamsByIp.set(remoteAddress, nextCount);
    return;
  }
  pendingMediaStreamsByIp.delete(remoteAddress);
}

export function getPendingMediaStreamCount(): number {
  return pendingMediaStreams.size;
}

export function getPendingMediaStreamCountForIp(remoteAddress: string): number {
  return pendingMediaStreamsByIp.get(remoteAddress) ?? 0;
}

export function resetPendingMediaStreamStateForTests(): void {
  for (const pending of pendingMediaStreams.values()) {
    clearTimeout(pending.timer);
  }
  pendingMediaStreams.clear();
  pendingMediaStreamsByIp.clear();
}

export function registerPendingMediaStreamConnection(input: {
  callSessionId: string;
  remoteAddress?: string;
  close: () => void;
  startTimeoutMs?: number;
  maxGlobalPending?: number;
  maxPendingPerIp?: number;
}): {
  accepted: boolean;
  cleanup: () => void;
  markStartValidated: () => void;
} {
  const remoteAddress = input.remoteAddress ?? 'unknown';
  const maxGlobalPending = input.maxGlobalPending ?? MAX_PENDING_MEDIA_STREAMS;
  const maxPendingPerIp = input.maxPendingPerIp ?? MAX_PENDING_MEDIA_STREAMS_PER_IP;
  const currentIpPending = pendingMediaStreamsByIp.get(remoteAddress) ?? 0;

  if (pendingMediaStreams.size >= maxGlobalPending || currentIpPending >= maxPendingPerIp) {
    mediaStreamPendingLimitExceededTotal.inc();
    void recordMediaStreamHealthEvent({
      tenantId: null,
      eventType: 'pending_limit_exceeded',
      reasonCode: 'MEDIA_STREAM_PENDING_LIMIT_EXCEEDED',
      metadata: {
        pendingCount: pendingMediaStreams.size,
        pendingForIp: currentIpPending,
        maxGlobalPending,
        maxPendingPerIp,
      },
    });
    logger.warn(
      {
        callSessionId: input.callSessionId,
        remoteAddress,
        pendingCount: pendingMediaStreams.size,
        pendingForIp: currentIpPending,
        maxGlobalPending,
        maxPendingPerIp,
      },
      'media_stream_pending_limit_exceeded',
    );
    input.close();
    return {
      accepted: false,
      cleanup: () => undefined,
      markStartValidated: () => undefined,
    };
  }

  const id = `${Date.now()}:${Math.random()}:${input.callSessionId}`;
  const pending: PendingMediaStreamConnection = {
    id,
    callSessionId: input.callSessionId,
    remoteAddress,
    cleanedUp: false,
    timer: setTimeout(() => {
      mediaStreamStartTimeoutTotal.inc();
      void recordMediaStreamHealthEvent({
        tenantId: null,
        eventType: 'start_timeout',
        reasonCode: 'MEDIA_STREAM_START_TIMEOUT',
      });
      logger.warn(
        { callSessionId: input.callSessionId, remoteAddress },
        'media_stream_start_timeout',
      );
      input.close();
      cleanup();
    }, input.startTimeoutMs ?? MEDIA_STREAM_START_TIMEOUT_MS),
  };

  function cleanup(): void {
    if (pending.cleanedUp) return;
    pending.cleanedUp = true;
    clearTimeout(pending.timer);
    pendingMediaStreams.delete(id);
    decrementPendingIp(remoteAddress);
  }

  pendingMediaStreams.set(id, pending);
  incrementPendingIp(remoteAddress);

  return {
    accepted: true,
    cleanup,
    markStartValidated: () => {
      logger.info(
        { callSessionId: input.callSessionId, remoteAddress },
        'media_stream_start_validated',
      );
      cleanup();
    },
  };
}

const buildContextualUpdate = (input: {
  agentName?: string;
  todayDate?: string;
  currentYear?: string;
  clinicName?: string;
  staffDirectory?: string;
  clinicNotes?: string;
  faqsList?: string;
  speechSpeedInstruction?: string;
}): string => {
  const lines = [
    'Context update for the receptionist:',
    input.agentName ? `Agent name: ${input.agentName}` : null,
    input.todayDate ? `Today (clinic timezone): ${input.todayDate}` : null,
    input.currentYear ? `Current year (clinic timezone): ${input.currentYear}` : null,
    input.clinicName ? `Clinic name: ${input.clinicName}` : null,
    input.staffDirectory ? `Staff directory: ${input.staffDirectory}` : null,
    input.clinicNotes ? `Clinic notes: ${input.clinicNotes}` : null,
    input.faqsList ? `FAQs: ${input.faqsList}` : null,
    'Instructions:',
    input.agentName
      ? `- Always introduce yourself as ${input.agentName}. Never use any other name.`
      : '- Always introduce yourself as the receptionist name provided by the clinic.',
    input.speechSpeedInstruction ? `- ${input.speechSpeedInstruction}` : null,
    '- When the caller gives a date without a year, always assume the current year shown above.',
    '- If that date already passed in the current year, use the next year.',
    '- Use the staff directory when asked about staff names, roles, phone numbers, or status.',
    '- If asked to connect to a staff member and their phone is listed, say you are forwarding the call to that phone (simulation in test).',
    '- Do not refuse to share staff names if they are listed in the staff directory.',
    '- If an answer is in the uploaded context, use it directly.',
    '- You can forward calls to staff members using the forward_call tool when the caller requests to speak to a human.',
    '- After booking an appointment, an SMS confirmation is sent automatically to the caller.',
    '- You can look up clinic info, business hours, patient records, and appointment availability using your tools.',
  ].filter(Boolean);

  return lines.join('\n');
};

export async function buildConvaiContext(tenantId: string) {
  const [clinic, services, policies, faqs, bookingRules, voiceProfile] = await Promise.all([
    configService.getClinicProfile(tenantId),
    configService.getServices(tenantId),
    configService.getPolicies(tenantId),
    configService.getFaqs(tenantId),
    configService.getBookingRules(tenantId),
    configService.getVoiceProfile(tenantId),
  ]);

  const contextDocs = (policies ?? [])
    .flatMap((policy) =>
      Array.isArray((policy as PolicyRecord)?.sensitiveTopics)
        ? ((policy as PolicyRecord).sensitiveTopics as SensitiveTopic[])
        : [],
    )
    .filter((topic: SensitiveTopic) => topic?.type === 'context_document');

  const formatStaffMembers = (
    staff: Array<{ name?: string; role?: string; phone?: string; workingDays?: string[] }>,
  ) => {
    if (!staff || !staff.length) return '';
    return staff
      .map((s) => {
        const role = s.role ?? 'Member';
        const days =
          Array.isArray(s.workingDays) && s.workingDays.length > 0
            ? `, works ${s.workingDays.join('/')}`
            : '';
        const base = `${s.name ?? 'Staff'} (${role}${days})`;
        return s.phone ? `${base} [${s.phone}]` : base;
      })
      .join(' | ');
  };

  const legacyStaffDirectory =
    contextDocs.find((doc: SensitiveTopic) => doc?.title === 'Staff Directory')?.content ?? '';
  const staffDirectory =
    Array.isArray(clinic?.staffMembers) && clinic.staffMembers.length > 0
      ? truncate(formatStaffMembers(clinic.staffMembers), 1000)
      : legacyStaffDirectory;

  const clinicNotes =
    contextDocs.find((doc: SensitiveTopic) => doc?.title === 'Clinic Notes')?.content ?? '';

  const normalizedBookingRules = bookingRules
    ? {
        ...bookingRules,
        closedDates: Array.isArray(bookingRules.closedDates)
          ? bookingRules.closedDates.filter(
              (value: unknown): value is string => typeof value === 'string',
            )
          : null,
      }
    : null;

  const clinicTimezone = clinic?.timezone ?? 'UTC';
  const todayDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: clinicTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const currentYear = todayDate.slice(0, 4);

  const vp = voiceProfile as Record<string, unknown> | null;
  const speechSpeedValue =
    typeof voiceProfile?.speechSpeed === 'number'
      ? voiceProfile.speechSpeed
      : typeof vp?.speakingSpeed === 'number'
        ? vp.speakingSpeed
        : typeof vp?.speakingSpeed === 'string'
          ? Number(vp.speakingSpeed)
          : undefined;

  const normalizedSpeechSpeed =
    typeof speechSpeedValue === 'number' && Number.isFinite(speechSpeedValue)
      ? speechSpeedValue
      : undefined;

  const speechSpeedInstruction =
    normalizedSpeechSpeed === undefined
      ? 'Speak slightly slower than normal and pause between sentences.'
      : normalizedSpeechSpeed <= 0.9
        ? 'Speak at a slow, deliberate pace and pause between sentences.'
        : normalizedSpeechSpeed < 1.0
          ? 'Speak slightly slower than normal and pause between sentences.'
          : normalizedSpeechSpeed <= 1.1
            ? 'Speak at a natural, steady pace with clear pauses between sentences.'
            : 'Speak at a brisk, efficient pace while staying easy to understand.';

  const now = new Date();
  const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: clinicTimezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const currentDateTime = dateTimeFormatter.format(now);

  const isOpen = isWithinBusinessHours(
    clinic?.businessHours as Record<string, { start: string; end: string } | null> | null,
    clinicTimezone,
  );
  const isAfterHoursText = isOpen
    ? `NOTE: The clinic is currently OPEN. Current date and time: ${currentDateTime}.`
    : `NOTE: The clinic is currently CLOSED. Current date and time: ${currentDateTime}. Do not offer same-day slots — offer tomorrow morning or the next business day.`;

  const dynamicVariables = {
    agent_name: 'Receptionist',
    clinic_name: clinic?.clinicName ?? 'Dentora Clinic',
    clinic_phone: clinic?.phone ?? clinic?.primaryPhone ?? 'Unknown',
    clinic_email: clinic?.email ?? clinic?.supportEmail ?? 'Unknown',
    clinic_address: clinic?.address ?? 'Unknown',
    clinic_website: clinic?.website ?? 'Unknown',
    clinic_timezone: clinicTimezone,
    today_date: todayDate,
    current_year: currentYear,
    current_datetime: currentDateTime,
    is_after_hours: isAfterHoursText,
    clinic_description: clinic?.description ?? '',
    clinic_specialties: Array.isArray(clinic?.specialties) ? clinic.specialties.join(', ') : '',
    business_hours: formatBusinessHours(
      clinic?.businessHours as Record<string, { start: string; end: string } | null> | undefined,
    ),
    services_list: formatServices(
      (services ?? []) as Array<{ serviceName?: string; durationMinutes?: number; price?: string }>,
    ),
    policies_list: formatPolicies(
      (policies ?? []) as Array<{ policyType?: string; content?: string }>,
    ),
    faqs_list: formatFaqs((faqs ?? []) as Array<{ question?: string; answer?: string }>),
    booking_rules: formatBookingRules(normalizedBookingRules),
    voice_tone: (vp?.tone as string) ?? '',
    voice_language: (vp?.language as string) ?? '',
    voice_id: (vp?.voiceId as string) ?? '',
    speech_speed: normalizedSpeechSpeed ?? '',
    greeting_message:
      (vp?.greetingMessage as string)?.trim() ||
      `Hi, thanks for calling ${clinic?.clinicName ?? 'the clinic'}. This is Receptionist — how can I help you today?`,
    after_hours_message: (vp?.afterHoursMessage as string) ?? '',
    hold_music: (vp?.holdMusic as string) ?? '',
    emergency_disclaimer: formatEmergencyInfo(
      (policies ?? []) as Array<{ emergencyDisclaimer?: string | null }>,
    ),
    escalation_conditions: formatEscalationInfo(
      (policies ?? []) as Array<{
        escalationConditions?: { type?: string; content?: string } | null;
      }>,
    ),
    staff_directory: String(staffDirectory ?? ''),
    clinic_notes: String(clinicNotes ?? ''),
  } as Record<string, unknown>;

  const contextualUpdate = buildContextualUpdate({
    agentName: dynamicVariables.agent_name as string,
    todayDate,
    currentYear,
    clinicName: dynamicVariables.clinic_name as string,
    staffDirectory: String(staffDirectory ?? ''),
    clinicNotes: String(clinicNotes ?? ''),
    faqsList: dynamicVariables.faqs_list as string,
    speechSpeedInstruction,
  });

  return { dynamicVariables, contextualUpdate, voiceProfile };
}

async function createConvaiWebSocket(
  session: MediaStreamSession,
  agentId: string,
): Promise<WebSocket> {
  const { apiKey } = await resolveApiKey(session.tenantId, 'elevenlabs');
  const response = await elevenLabsFetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    {
      headers: {
        'xi-api-key': apiKey,
      },
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ElevenLabs signed URL error: ${response.status} ${errorBody}`);
  }

  logger.info(
    { tenantId: session.tenantId, callSessionId: session.callSessionId, agentId },
    'ElevenLabs signed URL created',
  );

  const payload = (await response.json()) as { signed_url?: string };
  if (!payload.signed_url) {
    throw new Error('ElevenLabs signed URL response missing signed_url');
  }

  const socket = new WebSocket(payload.signed_url, ['convai']);

  socket.on('open', () => {
    const initPayload = {
      type: 'conversation_initiation_client_data',
      dynamic_variables: session.dynamicVariables,
      client_tools: [
        {
          name: 'forward_call',
          description:
            'Transfer the live call to a human team member or the clinic main line. Use this when the caller asks to speak to a person, a specific staff member, or a human.',
          parameters: {
            type: 'object',
            properties: {
              targetNumber: {
                type: 'string',
                description:
                  'E.164 phone number to forward to. Leave empty to use the clinic default number.',
              },
              staffName: {
                type: 'string',
                description:
                  'Name or role of the staff member to forward to (e.g. "Dr Smith"). Used to look up their number if targetNumber is empty.',
              },
            },
            required: [],
          },
        },
        {
          name: 'check_availability',
          description: 'Check available appointment slots for a given date or date range.',
          parameters: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'Date to check in YYYY-MM-DD format.' },
              dateRangeStart: { type: 'string', description: 'Start of date range YYYY-MM-DD.' },
              dateRangeEnd: { type: 'string', description: 'End of date range YYYY-MM-DD.' },
              durationMinutes: { type: 'number', description: 'Appointment duration in minutes.' },
            },
            required: [],
          },
        },
        {
          name: 'create_appointment',
          description: 'Book a new appointment for a patient after confirming all details.',
          parameters: {
            type: 'object',
            properties: {
              patientName: { type: 'string' },
              patientDob: { type: 'string', description: 'Date of birth YYYY-MM-DD.' },
              patientPhone: { type: 'string' },
              startIso: { type: 'string', description: 'Appointment start time in ISO 8601.' },
              durationMinutes: { type: 'number' },
              reason: { type: 'string' },
            },
            required: ['patientName', 'startIso'],
          },
        },
        {
          name: 'cancel_appointment',
          description: 'Cancel an existing appointment.',
          parameters: {
            type: 'object',
            properties: {
              appointmentId: { type: 'string' },
              patientName: { type: 'string' },
              patientPhone: { type: 'string' },
            },
            required: [],
          },
        },
        {
          name: 'reschedule_appointment',
          description: 'Reschedule an existing appointment to a new time.',
          parameters: {
            type: 'object',
            properties: {
              appointmentId: { type: 'string' },
              newStartIso: { type: 'string' },
              patientName: { type: 'string' },
              patientPhone: { type: 'string' },
            },
            required: ['newStartIso'],
          },
        },
        {
          name: 'lookup_patient',
          description: 'Look up an existing patient record by name or phone number.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              phone: { type: 'string' },
            },
            required: [],
          },
        },
        {
          name: 'set_reminder_consent',
          description:
            'Record whether the patient agrees to receive SMS/WhatsApp appointment reminders. Call this only after explicitly asking them, and after the patient record exists (e.g. once booked).',
          parameters: {
            type: 'object',
            properties: {
              phoneNumber: {
                type: 'string',
                description:
                  "The patient's phone number in E.164. Use the caller's number if you already have it.",
              },
              consent: {
                type: 'boolean',
                description: 'true if the patient agreed to reminders, false if they declined.',
              },
              channel: {
                type: 'string',
                description: 'Preferred channel if stated: sms, whatsapp, both, or none.',
              },
            },
            required: ['phoneNumber', 'consent'],
          },
        },
        {
          name: 'get_clinic_info',
          description: 'Get clinic contact details, address, and general information.',
          parameters: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'get_business_hours',
          description: 'Get the clinic opening hours and closed dates.',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      ],
    };
    socket.send(JSON.stringify(initPayload));
    logger.info(
      { tenantId: session.tenantId, callSessionId: session.callSessionId },
      'ElevenLabs conversation initiated',
    );
  });

  return socket;
}

export function attachMediaStreamWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({
    noServer: true,
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const callSessionId = url.pathname.split('/').pop() || '';
    const remoteAddress = req.socket.remoteAddress ?? 'unknown';

    logger.info(
      {
        callSessionId,
        remoteAddress,
        userAgent: req.headers['user-agent'],
      },
      'Media stream WebSocket connected',
    );

    let sessionInitialized = false;
    const pendingConnection = registerPendingMediaStreamConnection({
      callSessionId,
      remoteAddress,
      close: () => ws.close(),
    });

    if (!pendingConnection.accepted) {
      return;
    }

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.event) {
          case 'connected':
            logger.info(
              { callSessionId, protocol: message.protocol },
              'Twilio media stream connected',
            );
            break;

          case 'start':
            sessionInitialized = await handleStreamStart(ws, callSessionId, message);
            if (sessionInitialized) {
              pendingConnection.markStartValidated();
            } else {
              pendingConnection.cleanup();
            }
            break;

          case 'media':
            if (!sessionInitialized) break;
            handleMediaPayload(callSessionId, message);
            break;

          case 'stop':
            logger.info({ callSessionId }, 'Twilio media stream stopped');
            await handleStreamEnd(callSessionId, 'caller_hangup');
            break;

          case 'mark':
            logger.debug({ callSessionId, name: message.mark?.name }, 'Mark received');
            break;

          default:
            logger.debug({ event: message.event, callSessionId }, 'Unknown media stream event');
        }
      } catch (err) {
        mediaStreamInvalidStartTotal.inc();
        void recordMediaStreamHealthEvent({
          tenantId: null,
          eventType: 'invalid_start',
          reasonCode: 'MEDIA_STREAM_INVALID_START',
        });
        logger.warn({ callSessionId }, 'media_stream_invalid_start');
        pendingConnection.cleanup();
        ws.close();
        logger.error({ err, callSessionId }, 'Error processing media stream message');
      }
    });

    ws.on('close', async (code, reason) => {
      pendingConnection.cleanup();
      await handleStreamEnd(callSessionId, 'caller_hangup');
      logger.info(
        { callSessionId, code, reason: reason?.toString() },
        'Media stream WebSocket closed',
      );
    });

    ws.on('error', (err) => {
      pendingConnection.cleanup();
      logger.error({ err, callSessionId }, 'Media stream WebSocket error');
    });
  });

  server.on('upgrade', (req, socket, head) => {
    const requestUrl = new URL(req.url || '', `http://${req.headers.host}`);
    if (!requestUrl.pathname.startsWith('/api/telephony/media-stream/')) {
      return;
    }

    logger.info(
      { path: requestUrl.pathname, remoteAddress: req.socket.remoteAddress },
      'Upgrading request to media stream WebSocket',
    );
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  logger.info('Twilio Media Stream WebSocket server attached');
}

export async function handleStreamStart(
  ws: WebSocket,
  callSessionId: string,
  message: TwilioStartMessage,
): Promise<boolean> {
  const { streamSid, start: startData } = message;
  logger.info(
    {
      callSessionId,
      streamSid,
      callSid: startData?.callSid,
      accountSid: startData?.accountSid,
      mediaFormat: startData?.mediaFormat,
      tracks: startData?.tracks,
    },
    'Twilio media stream start received',
  );

  try {
    const customParameters = startData?.customParameters || {};
    const tokenClaims = verifyMediaStreamBinding({
      token: customParameters.streamToken,
      pathCallSessionId: callSessionId,
      startCallSid: startData?.callSid,
      customTenantId: customParameters.tenantId,
      customConfigVersionId: customParameters.configVersionId,
      customCallSessionId: customParameters.callSessionId,
    });

    const [callSession] = await db
      .select({
        tenantId: callSessions.tenantId,
        configVersionId: callSessions.configVersionId,
        twilioCallSid: callSessions.twilioCallSid,
        callerNumber: callSessions.callerNumber,
      })
      .from(callSessions)
      .where(eq(callSessions.id, callSessionId))
      .limit(1);

    try {
      assertMediaStreamCallSessionMatchesToken(tokenClaims, callSession);
    } catch {
      logger.warn(
        {
          callSessionId,
          streamSid,
          tokenTenantId: tokenClaims.tenantId,
          sessionTenantId: callSession?.tenantId,
          tokenCallSid: tokenClaims.callSid,
          sessionCallSid: callSession?.twilioCallSid,
          tokenConfigVersionId: tokenClaims.configVersionId,
          sessionConfigVersionId: callSession?.configVersionId,
        },
        'Media stream rejected: token does not match persisted call session',
      );
      ws.close();
      return false;
    }

    const { tenantId, configVersionId } = tokenClaims;

    // Decrypt caller number so it can be injected into agent context without being re-asked.
    let decryptedCallerNumber: string | null = null;
    if (callSession?.callerNumber) {
      try {
        decryptedCallerNumber = decryptField(callSession.callerNumber);
      } catch {
        // Non-fatal: agent will still work, just won't have pre-filled phone number.
      }
    }

    setActiveTenantContext({
      tenantId,
      correlationId: callSessionId,
      source: 'webhook',
    });

    const [cvRow] = await db
      .select({ version: tenantConfigVersions.version })
      .from(tenantConfigVersions)
      .where(eq(tenantConfigVersions.id, configVersionId))
      .limit(1);

    const configVersion = cvRow?.version ?? 1;
    const { dynamicVariables, contextualUpdate, voiceProfile } = await buildConvaiContext(tenantId);

    // Inject the inbound caller number so the agent never needs to ask the patient for their number.
    if (decryptedCallerNumber) {
      dynamicVariables.caller_phone_number = decryptedCallerNumber;
    }
    const callerPhoneInstruction = decryptedCallerNumber
      ? `\n- The caller's inbound phone number is ${decryptedCallerNumber}. Use this as their phone number for appointment booking — do NOT ask them for their phone number.`
      : '';
    const enrichedContextualUpdate = contextualUpdate + callerPhoneInstruction;

    const session: MediaStreamSession = {
      callSessionId,
      tenantId,
      configVersionId,
      configVersion,
      streamSid,
      callSid: startData?.callSid,
      ws,
      elevenReady: false,
      pendingAudioChunks: [],
      conversationHistory: [],
      lastActivityAt: Date.now(),
      startedAt: Date.now(),
      turnCount: 0,
      dynamicVariables,
      contextualUpdate: enrichedContextualUpdate,
    };

    activeSessions.set(callSessionId, session);
    logger.info(
      { callSessionId, tenantId, configVersionId, configVersion },
      'Media stream session stored in memory',
    );

    await callService.updateCallStatus(tenantId, callSessionId, 'in_progress');

    await callService.logCallEvent({
      tenantId,
      callSessionId,
      eventType: 'call.started',
      actor: 'system',
      payload: { streamSid },
    });

    const agentId = (voiceProfile as Record<string, unknown> | null)?.voiceAgentId as
      | string
      | undefined;
    if (!agentId) {
      logger.error({ tenantId, callSessionId }, 'No ElevenLabs agent ID configured for tenant');
      ws.close();
      return false;
    }

    // Fire-and-forget: patching takes 3 sequential ElevenLabs API round-trips (~4s on cache
    // miss) which would blow the 5s media_stream_start_timeout. The cache makes it a no-op
    // on subsequent calls within the 1-hour TTL, so the only affected call is the first one
    // after a cache miss — which will still work, just with the previous agent prompt.
    void ensureAgentPromptDates(tenantId, agentId);

    // If ElevenLabs is genuinely unreachable (signed-URL fetch fails), the caller is
    // already committed to <Connect><Stream> — bare-closing the ws leaves them in dead
    // air. Rescue them to the practice/voicemail instead, mirroring the abnormal mid-call
    // drop path. This matters because the webhook now re-admits a probe call once the
    // elevenlabs breaker's reset window elapses, so this path is reachable during a real
    // outage rather than only as dead air.
    let elevenSocket: WebSocket;
    try {
      elevenSocket = await createConvaiWebSocket(session, agentId);
    } catch (err) {
      logger.error(
        { err, callSessionId, tenantId },
        'ElevenLabs connection failed during stream init — rescuing caller',
      );
      await handleStreamEnd(callSessionId, 'elevenlabs_connect_failed');
      const rescued = session.callSid
        ? await redirectLiveCallToFallback({ tenantId, callSid: session.callSid, callSessionId })
        : { success: false };
      if (!rescued.success && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      return false;
    }

    // Guard: if the session ended while we were waiting for the ElevenLabs signed URL
    // (e.g. timeout fired or caller hung up), close the socket immediately rather than
    // leaving it orphaned.
    if (!activeSessions.has(callSessionId)) {
      elevenSocket.close();
      return false;
    }

    session.elevenSocket = elevenSocket;

    elevenSocket.on('message', (data) => {
      logger.debug(
        { callSessionId, length: data.toString().length },
        'ElevenLabs message received',
      );
      handleElevenLabsMessage(session, data.toString()).catch((err) => {
        logger.error({ err, callSessionId }, 'Failed to handle ElevenLabs message');
      });
    });

    elevenSocket.on('close', (code: number, reason: Buffer) => {
      // If the caller's Twilio socket is still open when ElevenLabs closes, the AI
      // dropped first (rather than the caller hanging up). A non-normal close code in
      // that state is an abnormal mid-call drop — the caller is left in dead air.
      // We record it (metric + health event) so the rate is visible before adding any
      // automatic live-call handoff. Behaviour is otherwise unchanged.
      const callerStillConnected = ws.readyState === WebSocket.OPEN;
      const abnormal = callerStillConnected && code !== 1000 && code !== 1001;
      logger.info(
        { callSessionId, code, reason: reason?.toString(), callerStillConnected },
        'ElevenLabs WebSocket closed',
      );
      // Capture session refs before handleStreamEnd removes it from the map.
      const session = activeSessions.get(callSessionId);
      const rescue =
        abnormal && session?.callSid
          ? { tenantId: session.tenantId, callSid: session.callSid }
          : null;

      if (abnormal) {
        mediaStreamAbnormalDisconnectTotal.inc({ code: String(code) });
        void recordMediaStreamHealthEvent({
          tenantId: session?.tenantId ?? null,
          eventType: 'abnormal_disconnect',
          reasonCode: `ELEVENLABS_CLOSE_${code}`,
        });
        logger.error(
          { callSessionId, code, turnCount: session?.turnCount ?? 0 },
          'ElevenLabs WebSocket dropped mid-call — rescuing caller',
        );
      }

      // Always call handleStreamEnd so the session is cleaned up even if the Twilio
      // close event never fires (e.g. socket is already CLOSING when ws.close() is called).
      void handleStreamEnd(callSessionId, abnormal ? 'elevenlabs_dropped' : 'elevenlabs_closed');

      if (rescue) {
        // Redirect the still-connected caller to a human/voicemail instead of dead air.
        // The Twilio REST redirect replaces the <Connect><Stream> and closes this ws;
        // only hang up ourselves if the rescue could not be issued.
        void redirectLiveCallToFallback({ ...rescue, callSessionId }).then((r) => {
          if (!r.success && ws.readyState === WebSocket.OPEN) ws.close();
        });
      } else if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    elevenSocket.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ECONNRESET' && !activeSessions.has(callSessionId)) {
        return;
      }
      logger.error({ err, callSessionId }, 'ElevenLabs WebSocket error');
    });

    logger.info({ tenantId, callSessionId, streamSid }, 'Media stream session initialized');
    return true;
  } catch (err) {
    mediaStreamInvalidStartTotal.inc();
    void recordMediaStreamHealthEvent({
      tenantId: null,
      eventType: 'invalid_start',
      reasonCode: 'MEDIA_STREAM_INVALID_START',
    });
    logger.warn({ callSessionId }, 'media_stream_invalid_start');
    logger.error({ err, callSessionId }, 'Failed to initialize media stream session');
    ws.close();
    return false;
  }
}

async function handleElevenLabsMessage(session: MediaStreamSession, raw: string): Promise<void> {
  return runWithTenantContext(
    { tenantId: session.tenantId, correlationId: session.callSessionId, source: 'webhook' },
    () => handleElevenLabsMessageWithTenant(session, raw),
  );
}

async function handleElevenLabsMessageWithTenant(
  session: MediaStreamSession,
  raw: string,
): Promise<void> {
  let message: ElevenLabsMessage & Record<string, unknown>;
  try {
    message = JSON.parse(raw) as ElevenLabsMessage & Record<string, unknown>;
  } catch {
    logger.debug('Ignoring non-JSON ElevenLabs message');
    return;
  }

  switch (message.type) {
    case 'conversation_initiation_metadata': {
      const meta = message.conversation_initiation_metadata_event || {};
      session.conversationId = meta.conversation_id;
      session.inputFormat = meta.user_input_audio_format;
      session.outputFormat = meta.agent_output_audio_format;
      session.elevenReady = true;

      const SUPPORTED_OUTPUT_FORMATS = new Set(['ulaw_8000', 'pcm_16000']);
      if (
        session.inputFormat !== 'ulaw_8000' ||
        !SUPPORTED_OUTPUT_FORMATS.has(session.outputFormat ?? '')
      ) {
        logger.error(
          {
            callSessionId: session.callSessionId,
            inputFormat: session.inputFormat,
            outputFormat: session.outputFormat,
          },
          'Unsupported ElevenLabs audio format for Twilio media stream',
        );
        await handleStreamEnd(session.callSessionId, 'audio_format_mismatch');
        if (session.ws.readyState === WebSocket.OPEN) {
          session.ws.close();
        }
        if (session.elevenSocket?.readyState === WebSocket.OPEN) {
          session.elevenSocket.close();
        }
        return;
      }
      session.needsTranscode = session.outputFormat === 'pcm_16000';

      if (session.contextualUpdate && session.elevenSocket?.readyState === WebSocket.OPEN) {
        logger.info(
          {
            callSessionId: session.callSessionId,
            todayDate: session.dynamicVariables?.today_date,
            currentYear: session.dynamicVariables?.current_year,
            contextualUpdatePreview: truncate(session.contextualUpdate, 500),
          },
          'Sending contextual update to ElevenLabs',
        );
        session.elevenSocket.send(
          JSON.stringify({
            type: 'contextual_update',
            text: session.contextualUpdate,
          }),
        );
      }

      flushPendingAudio(session);
      break;
    }
    case 'audio': {
      const audioBase64 = message.audio_event?.audio_base_64 as string | undefined;
      if (!audioBase64) return;
      logger.debug(
        { callSessionId: session.callSessionId, chunkSize: audioBase64.length },
        'Received audio from ElevenLabs',
      );
      sendAudioToTwilio(session, audioBase64);
      break;
    }
    case 'interruption': {
      logger.info({ callSessionId: session.callSessionId }, 'ElevenLabs interruption received');
      sendClearToTwilio(session);
      break;
    }
    case 'user_transcript': {
      const text = message.user_transcription_event?.user_transcript as string | undefined;
      if (!text) return;
      logger.info(
        { callSessionId: session.callSessionId, transcriptLength: text.length },
        'User transcript received',
      );
      session.conversationHistory.push({
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      });
      session.turnCount += 1;
      await callService.logCallEvent({
        tenantId: session.tenantId,
        callSessionId: session.callSessionId,
        eventType: 'conversation.message',
        actor: 'user',
        payload: { text },
      });
      break;
    }
    case 'agent_response': {
      const text = message.agent_response_event?.agent_response as string | undefined;
      if (!text) return;
      if (shouldPlayTypingSound(text)) {
        sendRawUlawToTwilio(session, TYPING_SOUND_ULAW_B64);
      }
      logger.info(
        { callSessionId: session.callSessionId, responseLength: text.length },
        'Agent response received',
      );
      session.conversationHistory.push({
        role: 'assistant',
        content: text,
        timestamp: new Date().toISOString(),
      });
      await callService.logCallEvent({
        tenantId: session.tenantId,
        callSessionId: session.callSessionId,
        eventType: 'conversation.message',
        actor: 'ai',
        payload: { text },
      });
      break;
    }
    case 'client_tool_call': {
      const toolCall = message.client_tool_call || {};
      const toolName = toolCall.tool_name as string | undefined;
      const toolCallId = toolCall.tool_call_id as string | undefined;
      const params = toolCall.parameters || {};
      if (!toolName || !toolCallId || !session.elevenSocket) return;

      logger.info(
        { callSessionId: session.callSessionId, toolName, toolCallId },
        'Tool call received from agent',
      );

      try {
        const result = await handleConvaiToolCall({
          tenantId: session.tenantId,
          toolName,
          params,
          callSid: session.callSid,
          callSessionId: session.callSessionId,
        });
        logger.info(
          {
            callSessionId: session.callSessionId,
            toolName,
            resultType: typeof result,
          },
          'Tool call handled successfully',
        );
        session.elevenSocket.send(
          JSON.stringify({
            type: 'client_tool_result',
            tool_call_id: toolCallId,
            result: typeof result === 'string' ? result : JSON.stringify(result),
            is_error: false,
          }),
        );
      } catch (error) {
        logger.error(
          {
            callSessionId: session.callSessionId,
            toolName,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          },
          'Tool call failed',
        );
        const messageText = 'Tool call failed safely. Please try again or contact the front desk.';
        session.elevenSocket.send(
          JSON.stringify({
            type: 'client_tool_result',
            tool_call_id: toolCallId,
            result: messageText,
            is_error: true,
          }),
        );
      }
      break;
    }
    case 'agent_tool_response': {
      const toolName = message.agent_tool_response?.tool_name;
      if (toolName === 'end_call') {
        logger.info({ callSessionId: session.callSessionId }, 'Agent requested end_call');
        await handleStreamEnd(session.callSessionId, 'agent_ended_call');
        if (session.ws.readyState === WebSocket.OPEN) {
          session.ws.close();
        }
      }
      break;
    }
    case 'ping': {
      const eventId = (message as ElevenLabsPing).ping_event?.event_id;
      if (session.elevenSocket?.readyState === WebSocket.OPEN && eventId !== undefined) {
        session.elevenSocket.send(JSON.stringify({ type: 'pong', event_id: eventId }));
      }
      break;
    }
    default:
      break;
  }
}

function handleMediaPayload(callSessionId: string, message: TwilioMediaMessage): void {
  const session = activeSessions.get(callSessionId);
  if (!session) {
    logger.warn({ callSessionId }, 'Media payload for unknown session');
    return;
  }

  const audioChunk = message.media?.payload as string | undefined;
  if (!audioChunk) return;

  session.lastActivityAt = Date.now();
  if (!session.firstMediaLogged) {
    session.firstMediaLogged = true;
    logger.info(
      { callSessionId, streamSid: session.streamSid, chunkSize: audioChunk.length },
      'First media chunk received',
    );
  }

  if (session.elevenReady && session.elevenSocket?.readyState === WebSocket.OPEN) {
    session.elevenSocket.send(JSON.stringify({ user_audio_chunk: audioChunk }));
    return;
  }

  if (session.pendingAudioChunks.length >= MAX_PENDING_AUDIO_CHUNKS) {
    session.pendingAudioChunks.shift();
  }
  session.pendingAudioChunks.push(audioChunk);
  logger.debug(
    { callSessionId, pending: session.pendingAudioChunks.length },
    'Buffered media chunk awaiting ElevenLabs readiness',
  );
}

function flushPendingAudio(session: MediaStreamSession): void {
  if (!session.elevenSocket || session.elevenSocket.readyState !== WebSocket.OPEN) return;
  for (const chunk of session.pendingAudioChunks) {
    session.elevenSocket.send(JSON.stringify({ user_audio_chunk: chunk }));
  }
  logger.info(
    { callSessionId: session.callSessionId, flushed: session.pendingAudioChunks.length },
    'Flushed pending audio chunks to ElevenLabs',
  );
  session.pendingAudioChunks = [];
}

// Linear PCM 16-bit signed → G.711 μ-law (ITU-T G.711)
function pcm16ToUlaw(pcmBuf: Buffer): Buffer {
  const out = Buffer.alloc(pcmBuf.length / 2);
  for (let i = 0; i < out.length; i++) {
    let sample = pcmBuf.readInt16LE(i * 2);
    const sign = sample < 0 ? 0x80 : 0;
    if (sample < 0) sample = -sample;
    sample = Math.min(sample, 32635);
    sample += 0x84;
    let exponent = 7;
    for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; exponent--, mask >>= 1);
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    out[i] = ~(sign | (exponent << 4) | mantissa) & 0xff;
  }
  return out;
}

// Downsample 16kHz → 8kHz by averaging pairs
function downsample16to8(pcmBuf: Buffer): Buffer {
  const samples = pcmBuf.length / 2;
  const out = Buffer.alloc(Math.floor(samples / 2) * 2);
  for (let i = 0; i < out.length / 2; i++) {
    const s1 = pcmBuf.readInt16LE(i * 4);
    const s2 = pcmBuf.readInt16LE(i * 4 + 2);
    out.writeInt16LE(Math.round((s1 + s2) / 2), i * 2);
  }
  return out;
}

// Send raw ulaw audio directly to Twilio — no transcoding. Used for pre-encoded
// assets like the typing sound that are already in ulaw 8kHz format.
function sendRawUlawToTwilio(session: MediaStreamSession, ulawBase64: string): void {
  if (session.ws.readyState !== WebSocket.OPEN) return;
  const chunkSize = 8000;
  for (let i = 0; i < ulawBase64.length; i += chunkSize) {
    const chunk = ulawBase64.slice(i, i + chunkSize);
    session.ws.send(
      JSON.stringify({ event: 'media', streamSid: session.streamSid, media: { payload: chunk } }),
    );
  }
}

function sendAudioToTwilio(session: MediaStreamSession, audioBase64: string): void {
  if (session.ws.readyState !== WebSocket.OPEN) return;

  let payload = audioBase64;
  if (session.needsTranscode) {
    const pcm16k = Buffer.from(audioBase64, 'base64');
    const pcm8k = downsample16to8(pcm16k);
    const ulaw = pcm16ToUlaw(pcm8k);
    payload = ulaw.toString('base64');
  }

  const chunkSize = 8000;
  let chunkCount = 0;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    session.ws.send(
      JSON.stringify({ event: 'media', streamSid: session.streamSid, media: { payload: chunk } }),
    );
    chunkCount += 1;
  }
  logger.debug({ callSessionId: session.callSessionId, chunkCount }, 'Sent audio chunks to Twilio');
}

function sendClearToTwilio(session: MediaStreamSession): void {
  if (session.ws.readyState !== WebSocket.OPEN) return;
  session.ws.send(
    JSON.stringify({
      event: 'clear',
      streamSid: session.streamSid,
    }),
  );
}

async function handleStreamEnd(callSessionId: string, endReason: string): Promise<void> {
  const session = activeSessions.get(callSessionId);
  if (!session) return;

  return runWithTenantContext(
    { tenantId: session.tenantId, correlationId: callSessionId, source: 'webhook' },
    () => handleStreamEndWithTenant(session, endReason),
  );
}

async function handleStreamEndWithTenant(
  session: MediaStreamSession,
  endReason: string,
): Promise<void> {
  const { callSessionId } = session;
  try {
    logger.info(
      { callSessionId, tenantId: session.tenantId, endReason },
      'Twilio media stream ending',
    );
    if (session.conversationHistory.length > 0) {
      const summary =
        (await callService.generateCallSummary({
          tenantId: session.tenantId,
          callSessionId,
          transcriptTurns: session.conversationHistory,
        })) || `Call with ${session.turnCount} turns`;

      await callService.saveTranscript({
        tenantId: session.tenantId,
        callSessionId,
        fullTranscript: session.conversationHistory.map((turn, i) => ({
          turn: i,
          role: turn.role,
          content: turn.content,
          timestamp: turn.timestamp,
        })),
        summary,
      });
    }

    await callService.updateCallStatus(session.tenantId, callSessionId, 'completed', {
      endReason,
    });

    await callService.logCallEvent({
      tenantId: session.tenantId,
      callSessionId,
      eventType: 'call.completed',
      actor: 'system',
      payload: { turnCount: session.turnCount, endReason },
    });

    // Enqueue background jobs — non-blocking, failures don't affect the call record
    const durationSeconds = Math.round((Date.now() - session.startedAt) / 1000);
    const aiResponseChars = session.conversationHistory
      .filter((t) => t.role === 'assistant')
      .reduce((sum, t) => sum + t.content.length, 0);
    const callerNumberMasked = '***'; // caller number is encrypted in DB — don't pass PHI in job

    const summary =
      session.conversationHistory.length > 0
        ? (session.conversationHistory
            .filter((t) => t.role === 'assistant')
            .slice(-1)[0]
            ?.content?.slice(0, 200) ?? 'No summary available')
        : 'No conversation recorded';

    void Promise.all([
      enqueueJob<CostAttributionJobData>(
        QUEUE_NAMES.COST_ATTRIBUTION,
        {
          tenantId: session.tenantId,
          callSessionId,
          durationSeconds,
          aiResponseChars,
          turnCount: session.turnCount,
        },
        { deduplicationId: `cost-${callSessionId}` },
      ),
      enqueueJob<AnalyticsEventJobData>(
        QUEUE_NAMES.ANALYTICS_EVENTS,
        { tenantId: session.tenantId, callSessionId, eventType: 'call.completed' },
        { deduplicationId: `analytics-${callSessionId}` },
      ),
      enqueueJob<NotificationJobData>(
        QUEUE_NAMES.NOTIFICATION_DELIVERY,
        {
          tenantId: session.tenantId,
          type: session.turnCount > 1 ? 'call_summary' : 'missed_call',
          callSessionId,
          payload: {
            durationSeconds,
            turnCount: session.turnCount,
            summary,
            callerNumberMasked,
            endReason,
          },
        },
        { deduplicationId: `notify-${callSessionId}` },
      ),
    ]).catch((err) => {
      logger.error({ err, callSessionId }, 'Failed to enqueue post-call jobs');
    });
  } catch (err) {
    logger.error({ err, callSessionId }, 'Error during stream cleanup');
  } finally {
    try {
      if (session.elevenSocket?.readyState === WebSocket.OPEN) {
        session.elevenSocket.close();
      }
    } catch {
      // ignore
    }
    activeSessions.delete(callSessionId);
  }
}

export function getActiveSessionCount(): number {
  return activeSessions.size;
}

export function getActiveSessionIds(): string[] {
  return Array.from(activeSessions.keys());
}

const sessionTimeoutInterval = setInterval(() => {
  const now = Date.now();
  for (const [callSessionId, session] of activeSessions.entries()) {
    if (now - session.lastActivityAt > MAX_SESSION_DURATION_MS) {
      handleStreamEnd(callSessionId, 'session_timeout').catch((err) => {
        logger.error({ err, callSessionId }, 'Failed to close timed-out session');
      });
    }
  }
}, 60_000);

export function clearSessionTimeoutInterval(): void {
  clearInterval(sessionTimeoutInterval);
}

export async function closeAllSessions(): Promise<void> {
  const sessionIds = Array.from(activeSessions.keys());
  logger.info(
    { count: sessionIds.length },
    'Closing all active media-stream sessions for shutdown',
  );
  await Promise.all(
    sessionIds.map((id) =>
      handleStreamEnd(id, 'server_shutdown').catch((err) => {
        logger.error({ err, callSessionId: id }, 'Error closing session during shutdown');
      }),
    ),
  );
}
