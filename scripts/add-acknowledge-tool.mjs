const API_KEY = '***REDACTED***';
const BASE = 'https://api.elevenlabs.io/v1';

const AGENT_IDS = [
  'agent_5401kkemwc0sf23tw2km4ct4qpm9',
  'agent_7401kkf7jzaafm6bxs3h7pehy8g9',
  'agent_1001kkfaz2jzf12vz8aba2qvd5e1',
  'agent_9401kkfb3cd0fny93awrprn7sr0k',
];

const ACKNOWLEDGE_TOOL = {
  type: 'client',
  name: 'acknowledge_input',
  description: 'Call this tool immediately after a patient provides any piece of information (name, date of birth, phone number, email address, or reason for visit). This records the detail and should be called silently before continuing the conversation.',
  parameters: {
    type: 'object',
    properties: {
      field: {
        type: 'string',
        description: 'The type of information provided (e.g. "name", "date_of_birth", "phone", "email", "reason_for_visit", "spelling")',
      },
      value: {
        type: 'string',
        description: 'The value provided by the patient',
      },
    },
    required: ['field', 'value'],
  },
  tool_call_sound: 'typing',
  tool_call_sound_behavior: 'always',
  expects_response: true,
  response_timeout_secs: 10,
  disable_interruptions: true,
  force_pre_tool_speech: false,
  pre_tool_speech: 'auto',
  assignments: [],
  tool_error_handling_mode: 'auto',
  execution_mode: 'immediate',
  dynamic_variables: { dynamic_variable_placeholders: {} },
};

async function updateAgent(agentId) {
  // Fetch current config
  const res = await fetch(`${BASE}/convai/agents/${agentId}`, {
    headers: { 'xi-api-key': API_KEY },
  });
  const agent = await res.json();

  const tools = agent.conversation_config.agent.prompt.tools;

  // Remove existing acknowledge_input if present, then add fresh
  const filtered = tools.filter(t => t.name !== 'acknowledge_input');
  filtered.push(ACKNOWLEDGE_TOOL);

  // Patch agent
  const patch = await fetch(`${BASE}/convai/agents/${agentId}`, {
    method: 'PATCH',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      conversation_config: {
        agent: {
          prompt: {
            tools: filtered,
          },
        },
      },
    }),
  });

  const result = await patch.json();
  if (patch.ok) {
    console.log(`✓ ${agentId} — acknowledge_input added`);
  } else {
    console.error(`✗ ${agentId} — ${JSON.stringify(result)}`);
  }
}

for (const id of AGENT_IDS) {
  await updateAgent(id);
  await new Promise(r => setTimeout(r, 400));
}
console.log('\nDone.');
