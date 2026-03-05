'use client';

import { Button } from '@/components/ui/button';
import type { MicrophoneDiagnosticsResult } from '@/lib/microphone-diagnostics';

type Props = {
  diagnostics: MicrophoneDiagnosticsResult;
  isChecking: boolean;
  onEnableMicrophone: () => void;
  onRefresh: () => void;
  onSelectDevice: (deviceId: string) => void;
};

function displayStatus(status: MicrophoneDiagnosticsResult['status']): string {
  if (status === 'ready') return 'Ready';
  if (status === 'permission-required') return 'Permission Required';
  if (status === 'no-microphone-detected') return 'No Microphone Detected';
  if (status === 'device-busy') return 'Device Busy';
  if (status === 'insecure-context') return 'Security Error';
  if (status === 'unsupported') return 'Unsupported Browser';
  return 'Error';
}

export function MicrophoneDiagnosticsPanel({
  diagnostics,
  isChecking,
  onEnableMicrophone,
  onRefresh,
  onSelectDevice,
}: Props) {
  const shouldShowEnableButton =
    diagnostics.status === 'permission-required' ||
    diagnostics.status === 'no-microphone-detected' ||
    diagnostics.permission !== 'granted';

  return (
    <div className="rounded-md border bg-muted/30 p-3 text-sm">
      <p className="font-medium">Microphone diagnostics</p>
      <p className="mt-1 text-muted-foreground">
        Permission: <span className="font-medium text-foreground">{diagnostics.permission}</span>
      </p>
      <p className="mt-1 text-muted-foreground">
        Status: <span className="font-medium text-foreground">{displayStatus(diagnostics.status)}</span>
      </p>
      <p className="mt-1 text-muted-foreground">
        Detected devices:{' '}
        <span className="font-medium text-foreground">{diagnostics.detectedDevices}</span>
      </p>
      <p className="mt-1 text-muted-foreground">
        Selected microphone:{' '}
        <span className="font-medium text-foreground">{diagnostics.selectedDeviceLabel || 'None'}</span>
      </p>
      {diagnostics.errorName && (
        <p className="mt-1 text-muted-foreground">
          Browser error:{' '}
          <span className="font-medium text-foreground">
            {diagnostics.errorName}: {diagnostics.errorMessage}
          </span>
        </p>
      )}
      {diagnostics.suggestion && (
        <p className="mt-1 text-yellow-700">Suggestion: {diagnostics.suggestion}</p>
      )}

      {diagnostics.devices.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          <label className="text-xs text-muted-foreground">Select microphone</label>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={diagnostics.selectedDeviceId}
            onChange={(event) => onSelectDevice(event.target.value)}
            disabled={isChecking}
          >
            {diagnostics.devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {shouldShowEnableButton && (
          <Button variant="outline" onClick={onEnableMicrophone} disabled={isChecking}>
            Enable Microphone
          </Button>
        )}
        <Button variant="outline" onClick={onRefresh} disabled={isChecking}>
          Re-run Diagnostics
        </Button>
      </div>
    </div>
  );
}
