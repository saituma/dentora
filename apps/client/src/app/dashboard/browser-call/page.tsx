'use client';

import { useEffect, useMemo, useState } from 'react';
import { Device, type Connection } from '@twilio/voice-sdk';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  useGetTelephonyNumbersQuery,
  useGetTelephonyWebhookBaseQuery,
  useCreateTwilioClientTokenMutation,
} from '@/features/telephony/telephonyApi';
import { API_BASE_URL } from '@/lib/api';

const statusColors: Record<string, string> = {
  disconnected: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  connecting: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  connected: 'bg-green-500/10 text-green-600 dark:text-green-400',
  error: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

export default function BrowserCallPage() {
  const { data: telephonyData } = useGetTelephonyNumbersQuery();
  const { data: webhookBaseData } = useGetTelephonyWebhookBaseQuery();
  const telephonyNumbers = telephonyData?.data ?? [];
  const [createToken, { isLoading: tokenLoading }] = useCreateTwilioClientTokenMutation();

  const [device, setDevice] = useState<Device | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [selectedNumber, setSelectedNumber] = useState<string>('');

  const numberOptions = useMemo(
    () => telephonyNumbers.map((number) => number.phoneNumber),
    [telephonyNumbers],
  );

  const webhookBase = webhookBaseData?.baseUrl?.replace(/\/+$/, '') || '';
  const apiRoot = webhookBase
    ? (webhookBase.endsWith('/api') ? webhookBase : `${webhookBase}/api`)
    : API_BASE_URL;
  const apiRootNormalized = apiRoot.replace(/\/+$/, '');

  const initializeDevice = async () => {
    try {
      const response = await createToken().unwrap();
      const token = response.data.token;

      const nextDevice = new Device(token, {
        logLevel: 'warn',
        closeProtection: true,
      });

      nextDevice.on('registered', () => {
        setStatus('disconnected');
      });
      nextDevice.on('error', (error) => {
        setStatus('error');
        toast.error(error.message || 'Twilio device error');
      });
      nextDevice.on('connect', (conn) => {
        setConnection(conn);
        setStatus('connected');
      });
      nextDevice.on('disconnect', () => {
        setConnection(null);
        setStatus('disconnected');
      });

      await nextDevice.register();
      setDevice(nextDevice);
    } catch (error) {
      setStatus('error');
      toast.error('Failed to initialize Twilio device');
    }
  };

  const startCall = async () => {
    if (!selectedNumber) {
      toast.error('Select a Twilio number to call');
      return;
    }
    if (!device) {
      await initializeDevice();
    }
    if (!device) return;

    try {
      setStatus('connecting');
      const conn = await device.connect({ params: { To: selectedNumber } });
      setConnection(conn);
    } catch {
      setStatus('error');
      toast.error('Failed to start call');
    }
  };

  const endCall = () => {
    device?.disconnectAll();
    setConnection(null);
    setStatus('disconnected');
  };

  useEffect(() => {
    if (!selectedNumber && numberOptions.length > 0) {
      setSelectedNumber(numberOptions[0]);
    }
  }, [numberOptions, selectedNumber]);

  useEffect(() => {
    return () => {
      device?.destroy();
    };
  }, [device]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Browser Call</h2>
        <p className="text-sm text-muted-foreground">
          Call your Twilio number directly from the dashboard using Twilio Client.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Call setup</CardTitle>
          <CardDescription>
            Requires a Twilio Voice SDK token and a TwiML App that points to
            `{apiRootNormalized}/telephony/webhook/client-voice`.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={selectedNumber} onValueChange={setSelectedNumber}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Select Twilio number" />
              </SelectTrigger>
              <SelectContent>
                {numberOptions.map((number) => (
                  <SelectItem key={number} value={number}>
                    {number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary" className={statusColors[status]}>
              {status}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={startCall} disabled={tokenLoading || status === 'connected' || status === 'connecting'}>
              {status === 'connected' ? 'In call' : 'Start call'}
            </Button>
            <Button variant="outline" onClick={endCall} disabled={!connection}>
              End call
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
