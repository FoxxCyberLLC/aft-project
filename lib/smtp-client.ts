// Minimal SMTP client implemented on top of Bun's TCP socket API.
//
// Supports:
//   - Implicit TLS (port 465) by passing tls = true
//   - Explicit STARTTLS upgrade (port 587)
//   - AUTH PLAIN and AUTH LOGIN
//   - quoted-printable text encoding
//
// Notes:
//   - rejectUnauthorized defaults to true. Set tlsRejectUnauthorized=false at
//     construction time only when talking to a known internal mail server with
//     a self-signed cert.
//   - The previous implementation imported `connect, TLSSocket` from `'bun'`,
//     which are not exports of the bun module, and called `await socket.read()`
//     which does not exist. This rewrite uses Bun.connect and the documented
//     event/data callback API.

interface SMTPConfig {
  host: string;
  port: number;
  /** True for implicit TLS (port 465). For STARTTLS on 587 leave this false. */
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  /** Defaults to true. Only set false for trusted internal servers. */
  tlsRejectUnauthorized?: boolean;
  /** Hostname for HELO/EHLO. Defaults to 'localhost'. */
  ehloName?: string;
  /** Connection/response timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
}

interface EmailMessage {
  from: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
}

interface SMTPResponse {
  code: number;
  message: string;
}

type AnySocket = any;

export class SMTPClient {
  private config: Required<Omit<SMTPConfig, 'auth'>> & Pick<SMTPConfig, 'auth'>;

  constructor(config: SMTPConfig) {
    this.config = {
      timeout: 30000,
      ehloName: 'localhost',
      tlsRejectUnauthorized: true,
      auth: undefined,
      ...config,
    } as any;
  }

  // Connect, perform handshake, return a session-bound helper closure set.
  private async openSession() {
    const buffer: string[] = [];
    let resolveData: ((s: string) => void) | null = null;
    let socketClosed = false;
    let socketError: Error | null = null;

    const flush = () => {
      if (resolveData && buffer.length > 0) {
        const r = resolveData;
        const data = buffer.join('');
        buffer.length = 0;
        resolveData = null;
        r(data);
      }
    };

    const handlers = {
      data(_socket: AnySocket, data: Uint8Array) {
        buffer.push(new TextDecoder().decode(data));
        flush();
      },
      open(_socket: AnySocket) {},
      close(_socket: AnySocket) {
        socketClosed = true;
        if (resolveData) {
          const r = resolveData;
          resolveData = null;
          r('');
        }
      },
      error(_socket: AnySocket, err: Error) {
        socketError = err;
        if (resolveData) {
          const r = resolveData;
          resolveData = null;
          r('');
        }
      },
    };

    const tlsOptions = this.config.secure
      ? { rejectUnauthorized: this.config.tlsRejectUnauthorized, serverName: this.config.host }
      : undefined;

    let socket: AnySocket = await (Bun as any).connect({
      hostname: this.config.host,
      port: this.config.port,
      tls: tlsOptions,
      socket: handlers,
    });

    const readChunk = (): Promise<string> =>
      new Promise<string>((resolve, reject) => {
        if (socketError) return reject(socketError);
        if (buffer.length > 0) {
          const data = buffer.join('');
          buffer.length = 0;
          return resolve(data);
        }
        if (socketClosed) return resolve('');
        resolveData = resolve;
        setTimeout(() => {
          if (resolveData === resolve) {
            resolveData = null;
            reject(new Error('SMTP read timeout'));
          }
        }, this.config.timeout);
      });

    // Read until we have a complete SMTP response (last line: "NNN ").
    const readResponse = async (): Promise<SMTPResponse> => {
      let acc = '';
      while (true) {
        const chunk = await readChunk();
        if (!chunk) {
          if (acc) break;
          throw new Error(socketError ? socketError.message : 'SMTP connection closed');
        }
        acc += chunk;
        const lines = acc.split(/\r?\n/).filter(Boolean);
        if (lines.length === 0) continue;
        const last = lines[lines.length - 1]!;
        if (last.length >= 4 && last[3] === ' ') break;
      }
      const code = parseInt(acc.substring(0, 3), 10);
      return { code, message: acc.trim() };
    };

    const writeLine = async (line: string) => {
      socket.write(`${line}\r\n`);
      // Bun sockets support flush() in newer versions; ignore otherwise.
      try {
        (socket as any).flush?.();
      } catch {}
    };

    // Server greeting
    const greet = await readResponse();
    if (greet.code !== 220) throw new Error(`SMTP greeting failed: ${greet.message}`);

    // EHLO
    await writeLine(`EHLO ${this.config.ehloName}`);
    let ehlo = await readResponse();
    if (ehlo.code !== 250) throw new Error(`EHLO rejected: ${ehlo.message}`);
    let extensions = this.parseExtensions(ehlo.message);

    // STARTTLS upgrade if available and not already TLS
    if (!this.config.secure && extensions.has('STARTTLS')) {
      await writeLine('STARTTLS');
      const r = await readResponse();
      if (r.code !== 220) throw new Error(`STARTTLS failed: ${r.message}`);

      // Bun supports upgrading a plain socket to TLS via socket.upgradeTLS().
      // If the running Bun version doesn't expose it, fail loudly rather than
      // continuing in plaintext.
      if (typeof (socket as any).upgradeTLS !== 'function') {
        throw new Error(
          'STARTTLS requested but this Bun runtime does not support socket.upgradeTLS(). Use port 465 (implicit TLS) instead.',
        );
      }
      socket = await (socket as any).upgradeTLS({
        hostname: this.config.host,
        rejectUnauthorized: this.config.tlsRejectUnauthorized,
        serverName: this.config.host,
      });

      // Send EHLO again on the now-secure channel.
      await writeLine(`EHLO ${this.config.ehloName}`);
      ehlo = await readResponse();
      if (ehlo.code !== 250) throw new Error(`Post-STARTTLS EHLO rejected: ${ehlo.message}`);
      extensions = this.parseExtensions(ehlo.message);
    }

    // Authenticate
    if (this.config.auth) {
      if (extensions.has('AUTH')) {
        const supports = (mech: string) => {
          for (const ext of extensions) {
            if (ext.startsWith('AUTH ') && ext.includes(mech)) return true;
          }
          return false;
        };

        if (supports('PLAIN')) {
          const token = Buffer.from(
            `\0${this.config.auth.user}\0${this.config.auth.pass}`,
          ).toString('base64');
          await writeLine(`AUTH PLAIN ${token}`);
          const r = await readResponse();
          if (r.code !== 235) throw new Error(`AUTH PLAIN failed: ${r.message}`);
        } else if (supports('LOGIN')) {
          await writeLine('AUTH LOGIN');
          let r = await readResponse();
          if (r.code !== 334) throw new Error(`AUTH LOGIN init failed: ${r.message}`);
          await writeLine(Buffer.from(this.config.auth.user).toString('base64'));
          r = await readResponse();
          if (r.code !== 334) throw new Error(`AUTH LOGIN user failed: ${r.message}`);
          await writeLine(Buffer.from(this.config.auth.pass).toString('base64'));
          r = await readResponse();
          if (r.code !== 235) throw new Error(`AUTH LOGIN pass failed: ${r.message}`);
        } else {
          throw new Error('SMTP server does not advertise a supported AUTH mechanism');
        }
      }
    }

    return { socket, readResponse, writeLine };
  }

  private parseExtensions(response: string): Set<string> {
    const set = new Set<string>();
    for (const line of response.split(/\r?\n/)) {
      const m = line.match(/^250[\s-](.+)$/);
      if (m?.[1]) set.add(m[1].trim().toUpperCase());
    }
    return set;
  }

  private formatAddress(address: string): string {
    const m = address.match(/<([^>]+)>/);
    return m ? m[1]! : address;
  }

  private generateMessageId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2);
    return `<${timestamp}.${random}@${this.config.host || 'localhost'}>`;
  }

  private encodeQuotedPrintable(text: string): string {
    return text
      .split('\n')
      .map((line) => {
        let encoded = '';
        let lineLen = 0;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]!;
          const code = ch.charCodeAt(0);
          let chunk: string;
          if (code === 61) {
            chunk = '=3D';
          } else if (code < 32 || code > 126) {
            chunk = `=${code.toString(16).toUpperCase().padStart(2, '0')}`;
          } else {
            chunk = ch;
          }
          if (lineLen + chunk.length > 73) {
            encoded += '=\r\n';
            lineLen = 0;
          }
          encoded += chunk;
          lineLen += chunk.length;
        }
        return encoded;
      })
      .join('\r\n');
  }

  private buildMimeMessage(message: EmailMessage): string {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const out: string[] = [];
    out.push(`From: ${message.from}`);
    out.push(`To: ${Array.isArray(message.to) ? message.to.join(', ') : message.to}`);
    out.push(`Subject: ${message.subject}`);
    out.push(`Message-ID: ${this.generateMessageId()}`);
    out.push(`Date: ${new Date().toUTCString()}`);
    out.push('MIME-Version: 1.0');
    if (message.headers) {
      for (const [k, v] of Object.entries(message.headers)) out.push(`${k}: ${v}`);
    }

    if (message.text && message.html) {
      out.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      out.push('');
      out.push(`--${boundary}`);
      out.push('Content-Type: text/plain; charset=UTF-8');
      out.push('Content-Transfer-Encoding: quoted-printable');
      out.push('');
      out.push(this.encodeQuotedPrintable(message.text));
      out.push(`--${boundary}`);
      out.push('Content-Type: text/html; charset=UTF-8');
      out.push('Content-Transfer-Encoding: quoted-printable');
      out.push('');
      out.push(this.encodeQuotedPrintable(message.html));
      out.push(`--${boundary}--`);
    } else if (message.html) {
      out.push('Content-Type: text/html; charset=UTF-8');
      out.push('Content-Transfer-Encoding: quoted-printable');
      out.push('');
      out.push(this.encodeQuotedPrintable(message.html));
    } else {
      out.push('Content-Type: text/plain; charset=UTF-8');
      out.push('Content-Transfer-Encoding: quoted-printable');
      out.push('');
      out.push(this.encodeQuotedPrintable(message.text || ''));
    }
    return out.join('\r\n');
  }

  async sendMail(message: EmailMessage): Promise<{ messageId: string; accepted: string[] }> {
    const session = await this.openSession();
    const { socket, readResponse, writeLine } = session;
    try {
      const from = this.formatAddress(message.from);
      await writeLine(`MAIL FROM:<${from}>`);
      let r = await readResponse();
      if (r.code !== 250) throw new Error(`MAIL FROM rejected: ${r.message}`);

      const recipients = Array.isArray(message.to) ? message.to : [message.to];
      const accepted: string[] = [];
      for (const recipient of recipients) {
        const to = this.formatAddress(recipient);
        await writeLine(`RCPT TO:<${to}>`);
        r = await readResponse();
        if (r.code === 250 || r.code === 251) accepted.push(recipient);
      }
      if (accepted.length === 0) throw new Error('No recipients accepted');

      await writeLine('DATA');
      r = await readResponse();
      if (r.code !== 354) throw new Error(`DATA rejected: ${r.message}`);

      // Dot-stuff lines that begin with '.' per RFC 5321 §4.5.2.
      const mime = this.buildMimeMessage(message)
        .split('\r\n')
        .map((line) => (line.startsWith('.') ? `.${line}` : line))
        .join('\r\n');
      socket.write(`${mime}\r\n.\r\n`);
      r = await readResponse();
      if (r.code !== 250) throw new Error(`Message rejected: ${r.message}`);

      const messageId = mime.match(/Message-ID:\s*(<[^>]+>)/i)?.[1] || this.generateMessageId();
      await writeLine('QUIT');
      try {
        await readResponse();
      } catch {}
      try {
        socket.end();
      } catch {}
      return { messageId, accepted };
    } catch (err) {
      try {
        socket.end();
      } catch {}
      throw err;
    }
  }

  async verify(): Promise<boolean> {
    try {
      const session = await this.openSession();
      try {
        await session.writeLine('QUIT');
      } catch {}
      try {
        session.socket.end();
      } catch {}
      return true;
    } catch (err) {
      console.error('SMTP verification failed:', err);
      return false;
    }
  }
}
