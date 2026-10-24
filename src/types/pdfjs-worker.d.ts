// pdfjs-dist ships no types for its worker module; only its presence matters to us.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
