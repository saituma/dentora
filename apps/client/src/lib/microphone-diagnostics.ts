export type MicrophonePermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown';

export type MicrophoneDiagnosticStatus =
  | 'ready'
  | 'permission-required'
  | 'no-microphone-detected'
  | 'device-busy'
  | 'insecure-context'
  | 'unsupported'
  | 'error';

export type MicrophoneDevice = {
  deviceId: string;
  label: string;
  isDefault: boolean;
};

export type MicrophoneDiagnosticsResult = {
  status: MicrophoneDiagnosticStatus;
  permission: MicrophonePermissionStatus;
  devices: MicrophoneDevice[];
  detectedDevices: number | 'unknown';
  selectedDeviceId: string;
  selectedDeviceLabel: string;
  errorName?: string;
  errorMessage?: string;
  suggestion?: string;
};

type DiagnosticsOptions = {
  requestPermission?: boolean;
  preferredDeviceId?: string;
};

const UNKNOWN_RESULT: MicrophoneDiagnosticsResult = {
  status: 'permission-required',
  permission: 'unknown',
  devices: [],
  detectedDevices: 'unknown',
  selectedDeviceId: '',
  selectedDeviceLabel: 'None',
};

function toErrorResult(
  base: MicrophoneDiagnosticsResult,
  status: MicrophoneDiagnosticStatus,
  errorName: string,
  errorMessage: string,
  suggestion: string,
): MicrophoneDiagnosticsResult {
  return {
    ...base,
    status,
    errorName,
    errorMessage,
    suggestion,
  };
}

async function getPermissionStatus(): Promise<MicrophonePermissionStatus> {
  if (!navigator.permissions?.query) return 'unknown';

  try {
    const state = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (state.state === 'granted') return 'granted';
    if (state.state === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unknown';
  }
}

function normalizeDevices(devices: MediaDeviceInfo[]): MicrophoneDevice[] {
  return devices
    .filter((device) => device.kind === 'audioinput')
    .map((device) => ({
      deviceId: device.deviceId,
      label: device.label || 'Microphone',
      isDefault: device.deviceId === 'default',
    }));
}

export async function runMicrophoneDiagnostics(
  options: DiagnosticsOptions = {},
): Promise<MicrophoneDiagnosticsResult> {
  const requestPermission = options.requestPermission ?? false;

  if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) {
    return {
      ...UNKNOWN_RESULT,
      status: 'unsupported',
      permission: 'unknown',
      errorName: 'NotSupportedError',
      errorMessage: 'Microphone APIs are not available in this browser.',
      suggestion: 'Use a modern browser with microphone support.',
    };
  }

  if (!window.isSecureContext) {
    return {
      ...UNKNOWN_RESULT,
      status: 'insecure-context',
      permission: 'denied',
      errorName: 'SecurityError',
      errorMessage: 'Page is not running in a secure context.',
      suggestion: 'Use HTTPS or localhost to access the microphone.',
    };
  }

  let permission = await getPermissionStatus();
  let stream: MediaStream | null = null;

  if (requestPermission) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      permission = 'granted';
    } catch (error) {
      const name = error instanceof DOMException ? error.name : 'UnknownError';
      const message = error instanceof Error ? error.message : 'Failed to access microphone.';

      if (name === 'NotFoundError') {
        const isPermissionPending = permission !== 'granted';
        return toErrorResult(
          {
            ...UNKNOWN_RESULT,
            permission,
            status: isPermissionPending ? 'permission-required' : 'no-microphone-detected',
            detectedDevices: 0,
          },
          isPermissionPending ? 'permission-required' : 'no-microphone-detected',
          name,
          message,
          isPermissionPending
            ? 'Browser could not access a microphone for this site yet. Allow microphone for this exact URL and verify browser input device settings.'
            : 'Microphone permission is granted, but the browser could not open an input source. Check browser microphone selection and OS input source, then retry.',
        );
      }

      if (name === 'NotAllowedError') {
        return toErrorResult(
          {
            ...UNKNOWN_RESULT,
            permission: 'denied',
            status: 'permission-required',
          },
          'permission-required',
          name,
          message,
          'Microphone permission was denied. Allow microphone access in browser site settings.',
        );
      }

      if (name === 'NotReadableError') {
        return toErrorResult(
          {
            ...UNKNOWN_RESULT,
            permission,
            status: 'device-busy',
          },
          'device-busy',
          name,
          message,
          'Microphone is busy or blocked by OS settings. Close other apps using it and retry.',
        );
      }

      if (name === 'SecurityError') {
        return toErrorResult(
          {
            ...UNKNOWN_RESULT,
            permission: 'denied',
            status: 'insecure-context',
          },
          'insecure-context',
          name,
          message,
          'Use HTTPS or localhost to access microphone APIs.',
        );
      }

      return toErrorResult(
        {
          ...UNKNOWN_RESULT,
          permission,
          status: 'error',
        },
        'error',
        name,
        message,
        'Microphone access failed. Retry and check browser/OS audio permissions.',
      );
    }
  }

  try {
    const allDevices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = normalizeDevices(allDevices);

    if (!requestPermission && permission !== 'granted') {
      return {
        status: 'permission-required',
        permission,
        devices: audioInputs,
        detectedDevices: audioInputs.length,
        selectedDeviceId: '',
        selectedDeviceLabel: 'None',
        suggestion:
          audioInputs.length > 0
            ? 'Enable microphone permission to continue.'
            : 'No microphone found yet. Plug one in and allow microphone permission.',
      };
    }

    if (permission === 'granted' && audioInputs.length === 0) {
      const activeTrack = stream?.getAudioTracks()[0];

      if (activeTrack) {
        const settings = activeTrack.getSettings();
        const fallbackDeviceId =
          typeof settings.deviceId === 'string' && settings.deviceId.length > 0
            ? settings.deviceId
            : 'default';

        return {
          status: 'ready',
          permission,
          devices: [
            {
              deviceId: fallbackDeviceId,
              label: 'System Microphone',
              isDefault: true,
            },
          ],
          detectedDevices: 1,
          selectedDeviceId: fallbackDeviceId,
          selectedDeviceLabel: 'System Microphone',
          suggestion:
            'Microphone is available, but this browser did not expose the full input list. You can still start the test call.',
        };
      }
    }

    const selectedDevice =
      audioInputs.find((device) => device.deviceId === options.preferredDeviceId) ||
      audioInputs.find((device) => device.isDefault) ||
      audioInputs[0];

    if (!selectedDevice) {
      return {
        status: permission === 'granted' ? 'no-microphone-detected' : 'permission-required',
        permission,
        devices: [],
        detectedDevices: 0,
        selectedDeviceId: '',
        selectedDeviceLabel: 'None',
        errorName: permission === 'granted' ? 'NotFoundError' : undefined,
        errorMessage: permission === 'granted' ? 'Requested device not found.' : undefined,
        suggestion:
          permission === 'granted'
            ? 'Plug in a microphone or check OS audio settings.'
            : 'Enable microphone permission to detect devices.',
      };
    }

    return {
      status: permission === 'granted' ? 'ready' : 'permission-required',
      permission,
      devices: audioInputs,
      detectedDevices: audioInputs.length,
      selectedDeviceId: selectedDevice.deviceId,
      selectedDeviceLabel: selectedDevice.label,
      suggestion:
        permission === 'granted'
          ? undefined
          : 'Enable microphone permission to continue.',
    };
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}
