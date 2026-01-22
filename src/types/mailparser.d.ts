// Type declarations for mailparser
declare module 'mailparser' {
  import { Readable } from 'stream';

  export interface ParsedMail {
    attachments?: Attachment[];
    subject?: string;
    from?: AddressObject;
    to?: AddressObject | AddressObject[];
    text?: string;
    html?: string;
    textAsHtml?: string;
    headers?: Headers;
  }

  export interface Attachment {
    filename?: string;
    contentId?: string;
    contentType: string;
    content: Buffer | string;
    size: number;
    checksum?: string;
  }

  export interface AddressObject {
    value: Array<{
      address: string;
      name?: string;
    }>;
    text: string;
  }

  export interface Headers {
    get(key: string): string | string[] | undefined;
  }

  export function simpleParser(source: Buffer | Readable | string): Promise<ParsedMail>;
}
