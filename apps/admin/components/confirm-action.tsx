"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ConfirmActionProps {
  /** The element that opens the dialog (a Button or DropdownMenuItem trigger). */
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  /** Run on confirm. Throw to surface an error toast and keep the dialog open. */
  onConfirm: () => Promise<void>;
  destructive?: boolean;
  /**
   * When set, the confirm button stays disabled until the user types this exact
   * string — use for money/irreversible actions.
   */
  confirmText?: string;
  successMessage?: string;
}

export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = false,
  confirmText,
  successMessage,
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const canConfirm = !confirmText || typed === confirmText;

  const handleConfirm = async () => {
    if (!canConfirm || busy) return;
    setBusy(true);
    try {
      await onConfirm();
      if (successMessage) toast.success(successMessage);
      setOpen(false);
      setTyped("");
    } catch (err) {
      const msg =
        (err as { data?: { error?: string } })?.data?.error ??
        (err as Error)?.message ??
        "Action failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTyped("");
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {confirmText && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-text" className="text-xs">
              Type{" "}
              <code className="font-mono text-foreground">{confirmText}</code>{" "}
              to confirm
            </Label>
            <Input
              id="confirm-text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              placeholder={confirmText}
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm || busy}
            className={
              destructive
                ? "bg-rose-500 text-primary-foreground hover:bg-rose-600"
                : undefined
            }
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
