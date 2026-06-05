#!/usr/bin/env node

const BASE_URL = 'https://api.elevenlabs.io/v1';
const PROMPT_VERSION = 'DENTORA_CALL_FLOW_V16';

function usage() {
  console.log(`
Sync Dentora ElevenLabs ConvAI agents for Twilio calls.

Usage:
  ELEVENLABS_API_KEY=... ELEVENLABS_AGENT_IDS=agent_a,agent_b node scripts/add-acknowledge-tool.mjs --apply
  ELEVENLABS_API_KEY=... node scripts/add-acknowledge-tool.mjs --agent agent_a --agent agent_b

Options:
  --apply              Patch agents. Without this, the script prints a dry-run summary.
  --agent <agent_id>   Agent ID to sync. Can be repeated.
  --help               Show this help.
`);
}

function parseArgs(argv) {
  const agentIds = [];
  let apply = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--agent') {
      const value = argv[i + 1];
      if (!value) throw new Error('--agent requires an agent ID');
      agentIds.push(value);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  const envAgentIds = (process.env.ELEVENLABS_AGENT_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return { apply, agentIds: [...new Set([...agentIds, ...envAgentIds])] };
}

function clientTool(input) {
  const properties = Object.fromEntries(
    Object.entries(input.properties ?? {}).map(([name, property]) => [
      name,
      {
        ...property,
        description: property.description ?? `${name} value.`,
      },
    ]),
  );

  return {
    type: 'client',
    name: input.name,
    description: input.description,
    parameters: {
      type: 'object',
      properties,
      required: input.required ?? [],
    },
    tool_call_sound: 'typing',
    tool_call_sound_behavior: 'always',
    expects_response: true,
    response_timeout_secs: 15,
    disable_interruptions: true,
    force_pre_tool_speech: false,
    pre_tool_speech: 'auto',
    assignments: [],
    tool_error_handling_mode: 'auto',
    execution_mode: 'immediate',
    dynamic_variables: { dynamic_variable_placeholders: {} },
  };
}

function buildClientTools() {
  return [
    clientTool({
      name: 'forward_call',
      description:
        'Transfer the live call to a human team member or the clinic main line when the caller asks for a person.',
      properties: {
        targetNumber: { type: 'string', description: 'E.164 phone number, or blank for default.' },
        staffName: { type: 'string', description: 'Named person or role, if the caller specified one.' },
      },
    }),
    clientTool({
      name: 'check_availability',
      description: 'Check available appointment slots for a requested date, time, or period.',
      properties: {
        requestedDate: { type: 'string', description: 'YYYY-MM-DD date to check.' },
        requestedTime: { type: 'string', description: 'Optional HH:mm preferred time.' },
        requestedPeriod: { type: 'string', description: 'morning, afternoon, or evening.' },
        appointmentDurationMinutes: { type: 'number', description: 'Appointment duration in minutes.' },
        maxSlots: { type: 'number', description: 'Maximum slots to return.' },
      },
      required: ['requestedDate'],
    }),
    clientTool({
      name: 'create_appointment',
      description: 'Book a new appointment after confirming patient details and slot.',
      properties: {
        fullName: { type: 'string', description: "Patient's confirmed full name." },
        dateOfBirth: { type: 'string', description: 'YYYY-MM-DD date of birth.' },
        phoneNumber: { type: 'string', description: 'E.164 phone number; use caller number if present.' },
        startIso: { type: 'string', description: 'Appointment start time in ISO 8601.' },
        endIso: { type: 'string', description: 'Appointment end time in ISO 8601.' },
        appointmentDurationMinutes: { type: 'number', description: 'Duration if endIso is unavailable.' },
        reasonForVisit: { type: 'string', description: 'Reason for visit in caller words.' },
      },
      required: ['fullName', 'phoneNumber', 'startIso', 'reasonForVisit'],
    }),
    clientTool({
      name: 'cancel_appointment',
      description: 'Cancel an existing appointment after verifying caller and appointment details.',
      properties: {
        confirmationId: { type: 'string' },
        appointmentId: { type: 'string' },
        appAppointmentId: { type: 'string' },
        eventId: { type: 'string' },
        phoneNumber: { type: 'string' },
        dateOfBirth: { type: 'string' },
        appointmentDate: { type: 'string' },
        appointmentTime: { type: 'string' },
      },
    }),
    clientTool({
      name: 'reschedule_appointment',
      description: 'Reschedule an existing appointment after verifying details and new slot.',
      properties: {
        confirmationId: { type: 'string' },
        appointmentId: { type: 'string' },
        appAppointmentId: { type: 'string' },
        eventId: { type: 'string' },
        phoneNumber: { type: 'string' },
        dateOfBirth: { type: 'string' },
        appointmentDate: { type: 'string' },
        appointmentTime: { type: 'string' },
        startIso: { type: 'string', description: 'New appointment start time in ISO 8601.' },
        endIso: { type: 'string', description: 'New appointment end time in ISO 8601.' },
        appointmentDurationMinutes: { type: 'number', description: 'Duration if endIso is unavailable.' },
      },
      required: ['startIso'],
    }),
    clientTool({
      name: 'lookup_patient',
      description: 'Verify an existing patient by phone number and date of birth.',
      properties: {
        phoneNumber: { type: 'string', description: 'E.164 phone number.' },
        dateOfBirth: { type: 'string', description: 'YYYY-MM-DD date of birth.' },
      },
      required: ['phoneNumber', 'dateOfBirth'],
    }),
    clientTool({
      name: 'set_reminder_consent',
      description: 'Record appointment reminder consent after explicitly asking the patient.',
      properties: {
        phoneNumber: { type: 'string', description: 'E.164 phone number.' },
        consent: { type: 'boolean', description: 'true if agreed, false if declined.' },
        channel: { type: 'string', description: 'sms, whatsapp, both, or none.' },
      },
      required: ['phoneNumber', 'consent'],
    }),
    clientTool({
      name: 'get_clinic_info',
      description: 'Get clinic contact details, staff, policies, FAQs, and practical info.',
    }),
    clientTool({
      name: 'get_business_hours',
      description: 'Get opening hours, timezone, and closed dates.',
    }),
    clientTool({
      name: 'acknowledge_input',
      description:
        'Acknowledge a captured patient detail. Use only after name, DOB, phone, spelling, or reason for visit.',
      properties: {
        field: { type: 'string', description: 'Captured field name.' },
        value: { type: 'string', description: 'Captured value.' },
      },
      required: ['field', 'value'],
    }),
  ];
}

function patchPayload(agent) {
  const config = agent.conversation_config ?? {};
  const prompt = config.agent?.prompt ?? {};
  const { tool_ids: _toolIds, ...promptWithoutToolIds } = prompt;
  const currentTools = Array.isArray(prompt.tools) ? prompt.tools : [];
  const managedNames = new Set(buildClientTools().map((tool) => tool.name));
  const unmanagedTools = currentTools.filter((tool) => !managedNames.has(tool.name));
  const tts = config.tts ?? {};

  return {
    conversation_config: {
      asr: {
        ...(config.asr ?? {}),
        user_input_audio_format: 'ulaw_8000',
      },
      tts: {
        ...tts,
        ...(tts.voice_id ? { voice_id: tts.voice_id } : {}),
        model_id: tts.model_id ?? 'eleven_v3_conversational',
        agent_output_audio_format: 'ulaw_8000',
        stability: 0.6,
        similarity_boost: 0.85,
        speed: 0.96,
        optimize_streaming_latency: 0,
      },
      agent: {
        prompt: {
          ...promptWithoutToolIds,
          prompt: String(prompt.prompt ?? '').includes(PROMPT_VERSION)
            ? prompt.prompt
            : `${PROMPT_VERSION}\n\n${prompt.prompt ?? ''}`.trim(),
          tools: [...unmanagedTools, ...buildClientTools()],
        },
      },
    },
  };
}

async function elevenFetch(path, apiKey, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'xi-api-key': apiKey,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(payload).slice(0, 500)}`);
  }
  return payload;
}

async function main() {
  const { apply, agentIds } = parseArgs(process.argv.slice(2));
  if (agentIds.length === 0) throw new Error('Provide --agent or ELEVENLABS_AGENT_IDS');

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is required');

  for (const agentId of agentIds) {
    const agent = await elevenFetch(`/convai/agents/${encodeURIComponent(agentId)}`, apiKey);
    const payload = patchPayload(agent);
    const summary = {
      agentId,
      mode: apply ? 'apply' : 'dry-run',
      inputFormat: payload.conversation_config.asr.user_input_audio_format,
      outputFormat: payload.conversation_config.tts.agent_output_audio_format,
      voicePreserved: Boolean(payload.conversation_config.tts.voice_id),
      toolCount: payload.conversation_config.agent.prompt.tools.length,
    };

    if (!apply) {
      console.log(JSON.stringify(summary));
      continue;
    }

    await elevenFetch(`/convai/agents/${encodeURIComponent(agentId)}`, apiKey, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    console.log(JSON.stringify({ ...summary, patched: true }));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
