'use client';

import { useTestAiReceptionist } from './use-test-ai-receptionist';
import { TestAiReceptionistView } from './test-ai-receptionist-view';

export default function TestAiReceptionistPage() {
  const model = useTestAiReceptionist();
  return <TestAiReceptionistView model={model} />;
}
