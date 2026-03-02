'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';
import { AudioPlayer } from '@/components/audio-player';
import { PhoneIcon, DownloadIcon } from 'lucide-react';

const mockCalls = [
  {
    id: '1',
    date: '2024-03-02 14:32',
    caller: '+1 555-0123',
    duration: 180,
    outcome: 'booked' as const,
    hasRecording: false,
    transcript:
      "Caller: Hi, I'd like to book a cleaning.\nAI: Of course! I have availability on Tuesday at 2pm or Thursday at 10am. Which works better?",
  },
  {
    id: '2',
    date: '2024-03-02 13:15',
    caller: '+1 555-0456',
    duration: 95,
    outcome: 'faq' as const,
    hasRecording: false,
    transcript:
      'Caller asked about pricing. AI provided information from knowledge base.',
  },
  {
    id: '3',
    date: '2024-03-02 11:42',
    caller: '+1 555-0789',
    duration: 220,
    outcome: 'transferred' as const,
    hasRecording: false,
    transcript:
      'Caller requested to speak with office manager. Call was transferred.',
  },
  {
    id: '4',
    date: '2024-03-01 16:20',
    caller: '+1 555-0321',
    duration: 45,
    outcome: 'abandoned' as const,
    hasRecording: false,
    transcript: 'Caller hung up during greeting.',
  },
];

const outcomeColors: Record<string, string> = {
  booked: 'bg-green-500/10 text-green-600 dark:text-green-400',
  faq: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  transferred: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  abandoned: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
};

export default function CallsPage() {
  const [selectedCall, setSelectedCall] = useState<
    (typeof mockCalls)[0] | null
  >(null);
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filteredCalls = mockCalls.filter((call) => {
    const matchOutcome =
      outcomeFilter === 'all' || call.outcome === outcomeFilter;
    const matchSearch =
      !search || call.caller.toLowerCase().includes(search.toLowerCase());
    return matchOutcome && matchSearch;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Call history</h2>
            <Badge variant="outline">Demo data</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            View transcripts and recordings
          </p>
        </div>
        <Button variant="outline" size="sm">
          <DownloadIcon className="mr-2 size-4" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Input
              placeholder="Search by caller..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select
              value={outcomeFilter}
              onValueChange={(value) => setOutcomeFilter(value ?? 'all')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                <SelectItem value="booked">Booked</SelectItem>
                <SelectItem value="faq">FAQ</SelectItem>
                <SelectItem value="transferred">Transferred</SelectItem>
                <SelectItem value="abandoned">Abandoned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredCalls.length === 0 ? (
            <EmptyState
              icon={PhoneIcon}
              title="No calls yet"
              description="Calls answered by your AI receptionist will appear here"
              action={
                <Button variant="outline" disabled>
                  Export CSV
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Caller</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Recording</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCalls.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell className="text-muted-foreground">
                      {call.date}
                    </TableCell>
                    <TableCell>{call.caller}</TableCell>
                    <TableCell>
                      {Math.floor(call.duration / 60)}m {call.duration % 60}s
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={outcomeColors[call.outcome]}
                      >
                        {call.outcome}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <AudioPlayer src={call.hasRecording ? '#' : undefined} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedCall(call)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={!!selectedCall}
        onOpenChange={(open) => !open && setSelectedCall(null)}
      >
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Call details</SheetTitle>
            <SheetDescription>
              {selectedCall?.caller} · {selectedCall?.date}
            </SheetDescription>
          </SheetHeader>
          {selectedCall && (
            <div className="mt-6 space-y-6">
              <div>
                <p className="text-sm font-medium">Outcome</p>
                <Badge
                  variant="secondary"
                  className={outcomeColors[selectedCall.outcome]}
                >
                  {selectedCall.outcome}
                </Badge>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Transcript</p>
                <div className="rounded-lg border bg-muted/30 p-4 text-sm whitespace-pre-wrap">
                  {selectedCall.transcript}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Recording</p>
                <AudioPlayer
                  src={selectedCall.hasRecording ? '#' : undefined}
                />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
