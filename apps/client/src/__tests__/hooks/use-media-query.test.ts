import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useMediaQuery } from '../../hooks/use-media-query';

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe('useMediaQuery', () => {
  it('returns true when media query matches', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('lg'));
    expect(result.current).toBe(true);
  });

  it('returns false when media query does not match', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('lg'));
    expect(result.current).toBe(false);
  });

  it('handles max- prefix breakpoints', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('max-md'));
    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith(expect.stringContaining('max-width'));
  });

  it('handles raw CSS media query strings', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 600px)'));
    expect(result.current).toBe(false);
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 600px)');
  });

  it('handles object-based query with min', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery({ min: 'md' }));
    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith(expect.stringContaining('min-width'));
  });

  it('handles object-based query with max', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery({ max: 'lg' }));
    expect(result.current).toBe(false);
    expect(window.matchMedia).toHaveBeenCalledWith(expect.stringContaining('max-width'));
  });
});
