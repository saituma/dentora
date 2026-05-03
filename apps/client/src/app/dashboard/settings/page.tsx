'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useGetClinicQuery, useUpdateClinicMutation } from '@/features/clinic/clinicApi';
import { useAppSelector } from '@/store/hooks';
import { useChangePasswordMutation, useSetPasswordMutation, useGetMeQuery } from '@/features/auth/authApi';
import { getUserFriendlyApiError } from '@/lib/api-error';

const timezones = [
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'Europe/London', label: 'London' },
];

export default function SettingsPage() {
  const { user } = useAppSelector((state) => state.auth);
  const { data: clinic, isLoading } = useGetClinicQuery();
  const [updateClinic, { isLoading: isSaving }] = useUpdateClinicMutation();
  const [changePassword, { isLoading: updatingPassword }] = useChangePasswordMutation();
  const [setPassword, { isLoading: settingPassword }] = useSetPasswordMutation();
  const { data: accountInfo } = useGetMeQuery();

  const [clinicName, setClinicName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [description, setDescription] = useState('');
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (clinic) {
      setClinicName(clinic.clinicName ?? '');
      setAddress(clinic.address ?? '');
      setPhone(clinic.phone ?? '');
      setEmail(clinic.email ?? '');
      setWebsite(clinic.website ?? '');
      setTimezone(clinic.timezone ?? 'America/New_York');
      setDescription(clinic.description ?? '');
    }
  }, [clinic]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const raw = localStorage.getItem('settings_notifications');
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as {
        emailAlerts?: boolean;
        smsAlerts?: boolean;
      };
      setEmailAlerts(parsed.emailAlerts ?? true);
      setSmsAlerts(parsed.smsAlerts ?? false);
    } catch {
      // ignore invalid local state
    }
  }, []);

  const handleSave = async () => {
    try {
      await updateClinic({
        clinicName,
        address,
        phone,
        email,
        website,
        timezone,
        description,
      }).unwrap();
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    }
  };

  const handleSaveNotifications = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        'settings_notifications',
        JSON.stringify({ emailAlerts, smsAlerts }),
      );
    }
    toast.success('Notification preferences saved');
  };

  const hasPassword = accountInfo?.hasPassword ?? true;

  const handleChangePassword = async () => {
    if (hasPassword && !currentPassword) {
      toast.error('Enter your current password');
      return;
    }
    if (!newPassword) {
      toast.error('Enter a new password');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }

    try {
      if (hasPassword) {
        await changePassword({ currentPassword, newPassword }).unwrap();
      } else {
        await setPassword({ newPassword }).unwrap();
      }
      setCurrentPassword('');
      setNewPassword('');
      toast.success(hasPassword ? 'Password updated' : 'Password set successfully');
    } catch (err: unknown) {
      toast.error(getUserFriendlyApiError(err));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Settings</h2>
          <p className="text-sm text-muted-foreground">
            Manage your clinic profile and preferences
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Clinic profile</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Clinic information</CardTitle>
              <CardDescription>
                Basic details about your practice
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <FieldGroup>
                  <Field>
                    <FieldLabel>Clinic name</FieldLabel>
                    <Input
                      value={clinicName}
                      onChange={(e) => setClinicName(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Address</FieldLabel>
                    <Input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </Field>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel>Phone</FieldLabel>
                      <Input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Email</FieldLabel>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel>Website</FieldLabel>
                    <Input
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Timezone</FieldLabel>
                    <Select
                      value={timezone}
                      onValueChange={(value) =>
                        setTimezone(value ?? 'America/New_York')
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {timezones.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>Description</FieldLabel>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      placeholder="A short description of your practice"
                    />
                  </Field>
                </FieldGroup>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team">
          <Card>
            <CardHeader>
              <CardTitle>Team members</CardTitle>
              <CardDescription>Invite and manage access</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{user?.displayName ?? 'Admin (you)'}</p>
                    <p className="text-sm text-muted-foreground">
                      {user?.email ?? clinic?.email ?? '—'}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">
                    {user?.role ?? 'owner'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Team management endpoints are not configured yet for this environment.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                Choose how you want to be notified
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">Email alerts</p>
                    <p className="text-sm text-muted-foreground">
                      Important events and reports
                    </p>
                  </div>
                  <Checkbox
                    checked={emailAlerts}
                    onCheckedChange={(value) => setEmailAlerts(value === true)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">SMS alerts</p>
                    <p className="text-sm text-muted-foreground">
                      Urgent notifications
                    </p>
                  </div>
                  <Checkbox
                    checked={smsAlerts}
                    onCheckedChange={(value) => setSmsAlerts(value === true)}
                  />
                </div>
                <Button variant="outline" onClick={handleSaveNotifications}>
                  Save notification preferences
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Password and 2FA</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                {!hasPassword && (
                  <p className="text-sm text-muted-foreground">
                    You signed in with Google. Set a password to also log in with email and password.
                  </p>
                )}
                <Field>
                  <FieldLabel>{hasPassword ? 'Change password' : 'Set a password'}</FieldLabel>
                  <div className="flex gap-2">
                    {hasPassword && (
                      <Input
                        type="password"
                        placeholder="Current password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                      />
                    )}
                    <Input
                      type="password"
                      placeholder="New password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                </Field>
                <Button
                  variant="outline"
                  onClick={handleChangePassword}
                  disabled={updatingPassword || settingPassword}
                >
                  {(updatingPassword || settingPassword)
                    ? 'Updating...'
                    : hasPassword ? 'Update password' : 'Set password'}
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
