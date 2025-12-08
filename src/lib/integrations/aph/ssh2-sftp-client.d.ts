// Type declarations for ssh2-sftp-client
declare module 'ssh2-sftp-client' {
  interface ConnectOptions {
    host: string;
    port?: number;
    username: string;
    password?: string;
    privateKey?: string | Buffer;
    passphrase?: string;
    readyTimeout?: number;
    retries?: number;
    retry_factor?: number;
    retry_minTimeout?: number;
  }

  interface FileInfo {
    type: string;
    name: string;
    size: number;
    modifyTime: number;
    accessTime: number;
    rights: {
      user: string;
      group: string;
      other: string;
    };
    owner: number;
    group: number;
  }

  class Client {
    constructor();
    connect(options: ConnectOptions): Promise<void>;
    put(src: string | Buffer, remotePath: string, options?: any): Promise<void>;
    get(remotePath: string, dst?: string | Buffer, options?: any): Promise<Buffer | string | void>;
    list(remotePath: string, pattern?: string | RegExp): Promise<FileInfo[]>;
    exists(remotePath: string): Promise<boolean | string>;
    mkdir(remotePath: string, recursive?: boolean): Promise<void>;
    rmdir(remotePath: string, recursive?: boolean): Promise<void>;
    delete(remotePath: string): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
    end(): Promise<void>;
    on(event: string, callback: (...args: any[]) => void): void;
    removeListener(event: string, callback: (...args: any[]) => void): void;
  }

  export = Client;
}

