'use client';

import type { ChartConfig } from '@/components/ui/chart';

export const viewOptions = [
  { label: 'Outline', value: 'outline' },
  { label: 'Past Performance', value: 'past-performance' },
  { label: 'Key Personnel', value: 'key-personnel' },
  { label: 'Focus Documents', value: 'focus-documents' },
];

export const reviewerOptions = [
  { label: 'Eddie Lake', value: 'Eddie Lake' },
  { label: 'Jamik Tashpulatov', value: 'Jamik Tashpulatov' },
];

export const editorReviewerOptions = [
  ...reviewerOptions,
  { label: 'Emily Whalen', value: 'Emily Whalen' },
];

export const chartData = [
  { month: 'January', desktop: 186, mobile: 80 },
  { month: 'February', desktop: 305, mobile: 200 },
  { month: 'March', desktop: 237, mobile: 120 },
  { month: 'April', desktop: 73, mobile: 190 },
  { month: 'May', desktop: 209, mobile: 130 },
  { month: 'June', desktop: 214, mobile: 140 },
];

export const chartConfig = {
  desktop: {
    label: 'Desktop',
    color: 'var(--primary)',
  },
  mobile: {
    label: 'Mobile',
    color: 'var(--primary)',
  },
} satisfies ChartConfig;
