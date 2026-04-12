import React from 'react';
import { PauseIcon, PlayIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { AvailableVoiceOption } from '@/features/onboarding/onboardingApi';

export function AudioPreviewPlayer({
  src,
  idleLabel,
  playingLabel,
}: {
  src: string;
  idleLabel: string;
  playingLabel: string;
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="size-9 shrink-0"
        onClick={() => {
          if (!audioRef.current) return;
          if (playing) {
            audioRef.current.pause();
            setPlaying(false);
            return;
          }
          audioRef.current
            .play()
            .then(() => setPlaying(true))
            .catch(() => {
              setPlaying(false);
              toast.error('Could not play greeting preview. Check browser/tab sound and try again.');
            });
        }}
      >
        {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
      </Button>
      <span className="text-sm text-muted-foreground">
        {playing ? playingLabel : idleLabel}
      </span>
      <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} className="hidden" />
    </div>
  );
}

export function isUkVoice(voice: AvailableVoiceOption): boolean {
  const searchable = [voice.locale, voice.accent, voice.label, voice.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    searchable.includes('en-gb')
    || searchable.includes('british')
    || searchable.includes('uk')
    || searchable.includes('united kingdom')
    || searchable.includes('english')
    || searchable.includes('england')
    || searchable.includes('scottish')
    || searchable.includes('welsh')
  );
}

export function isAgentVoice(voice: AvailableVoiceOption): boolean {
  const searchable = [voice.category, voice.label, voice.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    searchable.includes('agent')
    || searchable.includes('conversational')
    || searchable.includes('assistant')
    || searchable.includes('receptionist')
    || searchable.includes('chat')
    || searchable.includes('ivr')
    || searchable.includes('phone')
  );
}

function getSupportedContextFileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function isSupportedContextFile(file: File): boolean {
  const extension = getSupportedContextFileExtension(file.name);
  return file.type.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'xml', 'html', 'pdf', 'docx', 'xlsx'].includes(extension);
}

export async function readContextFileContent(file: File): Promise<string> {
  const extension = getSupportedContextFileExtension(file.name);
  if (file.type.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'xml', 'html'].includes(extension)) {
    return (await file.text()).trim();
  }

  if (extension === 'pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf');
    if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
    }
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    let text = '';
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const items = content.items as Array<{ str?: string }>;
      const pageText = items
        .map((item) => (typeof item.str === 'string' ? item.str : ''))
        .join(' ');
      text += `${pageText}\n`;
    }
    return text.trim();
  }

  if (extension === 'docx') {
    const mammoth = await import('mammoth/mammoth.browser');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return (result.value ?? '').trim();
  }

  if (extension === 'xlsx') {
    const XLSX = await import('xlsx');
    const data = new Uint8Array(await file.arrayBuffer());
    const workbook = XLSX.read(data, { type: 'array' });
    const sheets = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      return `# ${name}\n${csv}`;
    });
    return sheets.join('\n').trim();
  }

  return '';
}
