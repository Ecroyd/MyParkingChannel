// APH SFTP client for uploading rate files
// Server-side only - uses Node.js SFTP library
// DO NOT import this in client components

import Client from 'ssh2-sftp-client';
import type { AphSftpCredentials } from './types';

/**
 * Upload APH rates CSV file to SFTP server
 * @param credentials - SFTP connection credentials
 * @param filename - Name of the file to upload
 * @param content - CSV file content as string
 */
export async function uploadAphRatesFile(params: {
  credentials: AphSftpCredentials;
  filename: string;
  content: string;
}): Promise<void> {
  const { credentials, filename, content } = params;
  const sftp = new Client();

  try {
    await sftp.connect({
      host: credentials.host,
      port: credentials.port,
      username: credentials.username,
      password: credentials.password,
    });

    // Ensure trailing slash and build remote filepath
    const base = credentials.remotePath.endsWith('/')
      ? credentials.remotePath
      : credentials.remotePath + '/';
    const remoteFilePath = `${base}${filename}`;

    // Upload from a Buffer
    const buffer = Buffer.from(content, 'utf8');
    await sftp.put(buffer, remoteFilePath);

    console.log(`[APH SFTP] Successfully uploaded ${filename} to ${remoteFilePath}`);
  } catch (error: any) {
    console.error('[APH SFTP] Upload error:', error);
    throw new Error(`SFTP upload failed: ${error.message || String(error)}`);
  } finally {
    await sftp.end().catch(() => {
      // Ignore errors on close
    });
  }
}

