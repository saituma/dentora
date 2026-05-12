import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { useFormState } from '../../hooks/use-form-state';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
});

type FormData = z.infer<typeof schema>;

describe('useFormState', () => {
  it('initialises with isSubmitting false and no error', () => {
    const { result } = renderHook(() =>
      useFormState<FormData>({
        schema,
        onSubmit: vi.fn(),
      }),
    );
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.submitError).toBeNull();
    expect(result.current.submitSuccess).toBe(false);
  });

  it('calls onSubmit with valid data and sets submitSuccess', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useFormState<FormData>({
        schema,
        onSubmit,
        defaultValues: { name: 'Alice', email: 'alice@example.com' },
      }),
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Alice', email: 'alice@example.com' });
    expect(result.current.submitSuccess).toBe(true);
    expect(result.current.submitError).toBeNull();
  });

  it('sets submitError when onSubmit throws', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Server error'));
    const { result } = renderHook(() =>
      useFormState<FormData>({
        schema,
        onSubmit,
        defaultValues: { name: 'Bob', email: 'bob@example.com' },
      }),
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(result.current.submitError).toBe('Server error');
    expect(result.current.submitSuccess).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('resets isSubmitting to false after onSubmit resolves', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useFormState<FormData>({
        schema,
        onSubmit,
        defaultValues: { name: 'Carol', email: 'carol@example.com' },
      }),
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(result.current.isSubmitting).toBe(false);
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
