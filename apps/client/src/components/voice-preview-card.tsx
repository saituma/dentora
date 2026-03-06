'use client';

import * as React from 'react';
import { PlayIcon, PauseIcon, LoaderIcon, Volume2Icon, CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { ReceptionistVoiceOption } from '@/lib/voice-catalog';

export type VoiceOption = ReceptionistVoiceOption;

interface VoicePreviewCardProps {
  voice: VoiceOption;
  selected: boolean;
  onSelect: (voiceId: string) => void;
  previewAudioUrl: string | null;
  isGenerating: boolean;
  onPreview: (voiceId: string) => void;
  className?: string;
}

export function VoicePreviewCard({
  voice,
  selected,
  onSelect,
  previewAudioUrl,
  isGenerating,
  onPreview,
  className,
}: VoicePreviewCardProps) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const shouldAutoPlayRef = React.useRef(false);
  const [isPlaying, setIsPlaying] = React.useState(false);

  const togglePlay = async () => {
    if (!audioRef.current || !previewAudioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
        toast.error('Could not play audio. Check browser/tab sound and click again.');
      }
    }
  };

  // Stop playback when audio URL changes and auto-play when user just generated a sample.
  React.useEffect(() => {
    setIsPlaying(false);
    if (!previewAudioUrl || !shouldAutoPlayRef.current || !audioRef.current) {
      return;
    }

    shouldAutoPlayRef.current = false;
    audioRef.current
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => {
        setIsPlaying(false);
        toast.info('Sample generated. Click "Play sample" to listen.');
      });
  }, [previewAudioUrl]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(voice.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(voice.id);
        }
      }}
      className={cn(
        'relative flex cursor-pointer flex-col gap-3 rounded-xl border-2 p-4 transition-all',
        selected
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/50',
        className,
      )}
    >
      {/* Selection indicator */}
      {selected && (
        <div className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <CheckIcon className="size-3.5" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Volume2Icon className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{voice.name}</h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{voice.description}</p>
        </div>
        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {voice.accent.toUpperCase()} {voice.gender}
        </span>
      </div>

      {/* Tone badge */}
      <div className="flex items-center gap-1.5">
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
          {voice.tone}
        </span>
      </div>

      {/* Preview button */}
      <Button
        type="button"
        size="sm"
        variant={previewAudioUrl ? 'outline' : 'secondary'}
        className="mt-1 w-full gap-2"
        disabled={isGenerating}
        onClick={async (e) => {
          e.stopPropagation();
          if (previewAudioUrl) {
            await togglePlay();
          } else {
            shouldAutoPlayRef.current = true;
            await onPreview(voice.id);
          }
        }}
      >
        {isGenerating ? (
          <>
            <LoaderIcon className="size-3.5 animate-spin" />
            Generating...
          </>
        ) : previewAudioUrl && isPlaying ? (
          <>
            <PauseIcon className="size-3.5" />
            Pause
          </>
        ) : previewAudioUrl ? (
          <>
            <PlayIcon className="size-3.5" />
            Play sample
          </>
        ) : (
          <>
            <PlayIcon className="size-3.5" />
            Listen
          </>
        )}
      </Button>

      {previewAudioUrl && (
        <audio
          ref={audioRef}
          src={previewAudioUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}
    </div>
  );
}
