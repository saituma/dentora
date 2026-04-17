declare module 'pdfjs-dist/legacy/build/pdf' {
  export const GlobalWorkerOptions: { workerSrc?: string };
  export const getDocument: (options: { data: Uint8Array }) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: () => Promise<{ items: unknown[] }>;
      }>;
    }>;
  };
}

declare module 'mammoth/mammoth.browser' {
  export function extractRawText(options: { arrayBuffer: ArrayBuffer }): Promise<{ value?: string }>;
}
