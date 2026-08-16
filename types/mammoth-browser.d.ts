/**
 * Type declarations for `mammoth/mammoth.browser`.
 *
 * The published package ships types for the Node entrypoint only, but the app
 * must import the browser build so DOCX parsing runs client-side (hard
 * constraint #4). Only the subset we use is declared.
 */
declare module 'mammoth/mammoth.browser' {
  export interface MammothMessage {
    type: string;
    message: string;
  }

  export interface RawTextResult {
    value: string;
    messages: MammothMessage[];
  }

  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<RawTextResult>;

  export function convertToHtml(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<RawTextResult>;
}
