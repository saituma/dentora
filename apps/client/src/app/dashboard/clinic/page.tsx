'use client';

import { useEffect, useState, useRef } from 'react';
import { PageHeader } from '@/components/page-header';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetClinicQuery, useUpdateClinicMutation } from '@/features/clinic/clinicApi';
import {
  useGetPoliciesQuery,
  useAddPolicyMutation,
  useUpdatePolicyMutation,
} from '@/features/aiConfig/aiConfigApi';
import { API_BASE_URL } from '@/lib/api';

const TIMEZONES = [
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Dublin', label: 'Dublin (GMT/IST)' },
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
];

const NHS_OPTIONS = [
  { value: 'nhs_and_private', label: 'NHS & Private patients' },
  { value: 'nhs_only', label: 'NHS patients only' },
  { value: 'private_only', label: 'Private patients only' },
];

/** Serialise structured clinic details to plain text for AI consumption. */
function buildClinicNotesContent(fields: {
  parking: boolean;
  parkingDetails: string;
  nhsStatus: string;
  wheelchair: boolean;
  hearingLoop: boolean;
  accessibilityNotes: string;
  nearestTransport: string;
  additionalInfo: string;
}): string {
  const lines: string[] = [];

  const nhsLabel = NHS_OPTIONS.find((o) => o.value === fields.nhsStatus)?.label ?? fields.nhsStatus;
  lines.push(`NHS/Private: ${nhsLabel}`);

  if (fields.parking) {
    lines.push(
      `Parking: Available${fields.parkingDetails ? ` — ${fields.parkingDetails.trim()}` : ''}`,
    );
  } else {
    lines.push(
      `Parking: Not available${fields.parkingDetails ? ` — ${fields.parkingDetails.trim()}` : ''}`,
    );
  }

  const accessItems: string[] = [];
  if (fields.wheelchair) accessItems.push('wheelchair accessible entrance');
  if (fields.hearingLoop) accessItems.push('hearing loop');
  if (fields.accessibilityNotes.trim()) accessItems.push(fields.accessibilityNotes.trim());
  if (accessItems.length > 0) {
    lines.push(`Accessibility: ${accessItems.join(', ')}`);
  }

  if (fields.nearestTransport.trim()) {
    lines.push(`Nearest transport: ${fields.nearestTransport.trim()}`);
  }

  if (fields.additionalInfo.trim()) {
    lines.push(`Additional info: ${fields.additionalInfo.trim()}`);
  }

  return lines.join('\n');
}

/** Parse structured fields back from plain-text clinic notes. */
function parseClinicNotes(content: string) {
  const defaults = {
    parking: false,
    parkingDetails: '',
    nhsStatus: 'nhs_and_private',
    wheelchair: false,
    hearingLoop: false,
    accessibilityNotes: '',
    nearestTransport: '',
    additionalInfo: '',
  };

  if (!content) return defaults;

  for (const line of content.split('\n')) {
    const lower = line.toLowerCase();

    if (lower.startsWith('nhs/private:')) {
      const val = line.slice(12).trim().toLowerCase();
      if (val.includes('nhs') && val.includes('private')) defaults.nhsStatus = 'nhs_and_private';
      else if (val.includes('nhs')) defaults.nhsStatus = 'nhs_only';
      else if (val.includes('private')) defaults.nhsStatus = 'private_only';
    }

    if (lower.startsWith('parking:')) {
      const rest = line.slice(8).trim();
      defaults.parking = rest.toLowerCase().startsWith('available');
      const dashIdx = rest.indexOf('—');
      if (dashIdx !== -1) defaults.parkingDetails = rest.slice(dashIdx + 1).trim();
    }

    if (lower.startsWith('accessibility:')) {
      const rest = line.slice(14).trim().toLowerCase();
      defaults.wheelchair = rest.includes('wheelchair');
      defaults.hearingLoop = rest.includes('hearing loop');
      const extra = rest
        .replace('wheelchair accessible entrance', '')
        .replace('hearing loop', '')
        .replace(/^,\s*/, '')
        .replace(/,\s*$/, '')
        .trim();
      defaults.accessibilityNotes = extra;
    }

    if (lower.startsWith('nearest transport:')) {
      defaults.nearestTransport = line.slice(18).trim();
    }

    if (lower.startsWith('additional info:')) {
      defaults.additionalInfo = line.slice(16).trim();
    }
  }

  return defaults;
}

export default function ClinicPage() {
  const { data: clinic, isLoading: clinicLoading, refetch: refetchClinic } = useGetClinicQuery();
  const { data: policiesData, isLoading: policiesLoading } = useGetPoliciesQuery();
  const [updateClinic] = useUpdateClinicMutation();
  const [addPolicy] = useAddPolicyMutation();
  const [updatePolicy] = useUpdatePolicyMutation();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Basic info
  const [clinicName, setClinicName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [timezone, setTimezone] = useState('Europe/London');
  const [description, setDescription] = useState('');

  // Practical details
  const [parking, setParking] = useState(false);
  const [parkingDetails, setParkingDetails] = useState('');
  const [nhsStatus, setNhsStatus] = useState('nhs_and_private');
  const [wheelchair, setWheelchair] = useState(false);
  const [hearingLoop, setHearingLoop] = useState(false);
  const [accessibilityNotes, setAccessibilityNotes] = useState('');
  const [nearestTransport, setNearestTransport] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');

  const isLoading = clinicLoading || policiesLoading;

  useEffect(() => {
    if (!clinic) return;
    setClinicName(clinic.clinicName ?? '');
    setAddress(clinic.address ?? '');
    setPhone(clinic.phone ?? '');
    setEmail(clinic.email ?? '');
    setWebsite(clinic.website ?? '');
    setTimezone(clinic.timezone ?? 'Europe/London');
    setDescription(clinic.description ?? '');
  }, [clinic]);

  useEffect(() => {
    if (!policiesData?.data) return;
    const clinicNotes = policiesData.data.find((p) => {
      const topics = p.sensitiveTopics;
      if (!Array.isArray(topics)) return false;
      return topics.some((t) => t.type === 'context_document' && t.title === 'Clinic Notes');
    });
    if (!clinicNotes) return;
    const topic = clinicNotes.sensitiveTopics?.find(
      (t) => t.type === 'context_document' && t.title === 'Clinic Notes',
    );
    if (!topic?.content) return;
    const parsed = parseClinicNotes(topic.content);
    setParking(parsed.parking);
    setParkingDetails(parsed.parkingDetails);
    setNhsStatus(parsed.nhsStatus);
    setWheelchair(parsed.wheelchair);
    setHearingLoop(parsed.hearingLoop);
    setAccessibilityNotes(parsed.accessibilityNotes);
    setNearestTransport(parsed.nearestTransport);
    setAdditionalInfo(parsed.additionalInfo);
  }, [policiesData]);

  const handleSave = async () => {
    const notesContent = buildClinicNotesContent({
      parking,
      parkingDetails,
      nhsStatus,
      wheelchair,
      hearingLoop,
      accessibilityNotes,
      nearestTransport,
      additionalInfo,
    });

    // Find existing "Clinic Notes" context doc policy (if any)
    const existingPolicy = policiesData?.data?.find((p) => {
      const topics = p.sensitiveTopics;
      if (!Array.isArray(topics)) return false;
      return topics.some((t) => t.type === 'context_document' && t.title === 'Clinic Notes');
    });

    const saveClinic = updateClinic({
      clinicName: clinicName.trim(),
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
      website: website.trim(),
      timezone,
      description: description.trim(),
    }).unwrap();

    const newTopicPayload = {
      type: 'context_document',
      title: 'Clinic Notes',
      content: notesContent,
    };

    const saveNotes = existingPolicy
      ? updatePolicy({
          id: existingPolicy.id,
          data: {
            sensitiveTopics: [
              ...(existingPolicy.sensitiveTopics ?? []).filter(
                (t) => !(t.type === 'context_document' && t.title === 'Clinic Notes'),
              ),
              newTopicPayload,
            ],
          },
        }).unwrap()
      : addPolicy({
          policyType: 'clinic_info',
          content: '',
        })
          .unwrap()
          .then((created) =>
            updatePolicy({
              id: created.id,
              data: { sensitiveTopics: [newTopicPayload] },
            }).unwrap(),
          );

    toast.promise(Promise.all([saveClinic, saveNotes]), {
      loading: 'Saving clinic details…',
      success: 'Clinic details saved',
      error: 'Failed to save clinic details',
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clinic Details"
        subtitle="Everything the AI receptionist needs to answer patient questions."
        actions={
          <Button onClick={handleSave} disabled={isLoading}>
            Save changes
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-6 space-y-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* ── Basic Info ─────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Basic information</CardTitle>
              <CardDescription>
                Core contact details shown to patients and used by the AI
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Clinic name</Label>
                  <Input
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    placeholder="e.g. Dentora Dental Practice"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Timezone</Label>
                  <Select value={timezone} onValueChange={(v) => v && setTimezone(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Address</Label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. 12 High Street, London, EC1A 1BB"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Phone number</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+44 20 1234 5678"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="hello@yourclinic.co.uk"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://yourclinic.co.uk"
                />
              </div>

              <div className="space-y-1.5">
                <Label>About the practice</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="A short description of your practice — the AI will share this with patients who ask."
                />
              </div>

              <div className="space-y-1.5">
                <Label>Clinic logo</Label>
                <div className="flex items-center gap-4">
                  {clinic?.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${API_BASE_URL}/uploads/image?key=${encodeURIComponent(clinic.logo)}`}
                      alt="Clinic logo"
                      className="h-16 w-16 rounded-lg object-cover border"
                    />
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingLogo(true);
                      const token =
                        typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
                      const form = new FormData();
                      form.append('file', file);
                      try {
                        const res = await fetch(`${API_BASE_URL}/uploads/clinic-logo`, {
                          method: 'POST',
                          headers: token ? { Authorization: `Bearer ${token}` } : {},
                          body: form,
                        });
                        if (!res.ok) throw new Error('Upload failed');
                        await refetchClinic();
                        toast.success('Logo updated');
                      } catch {
                        toast.error('Logo upload failed');
                      } finally {
                        setUploadingLogo(false);
                        if (logoInputRef.current) logoInputRef.current.value = '';
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    disabled={uploadingLogo}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {uploadingLogo ? 'Uploading…' : clinic?.logo ? 'Change logo' : 'Upload logo'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Practice type ──────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Practice type</CardTitle>
              <CardDescription>
                Patients often ask if you accept NHS. The AI will answer this directly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5 max-w-sm">
                <Label>NHS / Private</Label>
                <Select value={nhsStatus} onValueChange={(v) => v && setNhsStatus(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NHS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* ── Parking ────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Parking</CardTitle>
              <CardDescription>
                One of the most common patient questions. The AI will answer accurately.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch id="parking-toggle" checked={parking} onCheckedChange={setParking} />
                <Label htmlFor="parking-toggle" className="cursor-pointer">
                  {parking ? 'Parking available' : 'No parking available'}
                </Label>
              </div>
              <div className="space-y-1.5">
                <Label>Parking details</Label>
                <Textarea
                  value={parkingDetails}
                  onChange={(e) => setParkingDetails(e.target.value)}
                  rows={2}
                  placeholder={
                    parking
                      ? 'e.g. Free car park behind the building, 10 spaces, open until 8pm'
                      : 'e.g. Nearest public car park is NCP on High Street, 3-minute walk'
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* ── Accessibility ──────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Accessibility</CardTitle>
              <CardDescription>
                Help patients with accessibility needs know what to expect.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
                <div className="flex items-center gap-3">
                  <Switch id="wheelchair" checked={wheelchair} onCheckedChange={setWheelchair} />
                  <Label htmlFor="wheelchair" className="cursor-pointer">
                    Wheelchair accessible entrance
                  </Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="hearing-loop"
                    checked={hearingLoop}
                    onCheckedChange={setHearingLoop}
                  />
                  <Label htmlFor="hearing-loop" className="cursor-pointer">
                    Hearing loop available
                  </Label>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Additional accessibility notes</Label>
                <Textarea
                  value={accessibilityNotes}
                  onChange={(e) => setAccessibilityNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Step-free throughout, accessible toilet on ground floor, patient lift available"
                />
              </div>
            </CardContent>
          </Card>

          {/* ── Getting here ───────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Getting here</CardTitle>
              <CardDescription>
                Transport links and directions the AI can share when patients ask.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <Label>Nearest transport / directions</Label>
              <Textarea
                value={nearestTransport}
                onChange={(e) => setNearestTransport(e.target.value)}
                rows={3}
                placeholder="e.g. 2-minute walk from Holborn tube station (Central/Piccadilly line). Bus routes 8, 25, 242 stop outside."
              />
            </CardContent>
          </Card>

          {/* ── Additional info ────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Additional information</CardTitle>
              <CardDescription>
                Anything else patients ask about — late opening, payment methods, languages spoken,
                specialist services, etc.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <Label>Other details for the AI</Label>
              <Textarea
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
                rows={5}
                placeholder={`e.g.
- We accept card, cash, and dental finance plans
- Late appointments available on Thursdays until 7pm
- Languages spoken: English, Polish, Urdu
- Free check-ups for NHS children under 18
- Nervous patient appointments available — just ask`}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end pb-4">
            <Button onClick={handleSave} disabled={isLoading} size="lg">
              Save changes
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
