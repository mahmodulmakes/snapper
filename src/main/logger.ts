type Level = 'info' | 'warn' | 'error'

function write(level: Level, message: string, meta?: unknown): void {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`
  if (meta !== undefined) {
    console[level](line, meta)
  } else {
    console[level](line)
  }
}

export const logger = {
  info: (message: string, meta?: unknown): void => write('info', message, meta),
  warn: (message: string, meta?: unknown): void => write('warn', message, meta),
  error: (message: string, meta?: unknown): void => write('error', message, meta)
}
