type Level = 'info' | 'warn' | 'error';

function write(level: Level, context: string, msg: string, data?: Record<string, unknown>): void {
  const entry = {
    ts:      new Date().toISOString(),
    level,
    context,
    msg,
    ...data,
  };
  const out = level === 'error' ? process.stderr : process.stdout;
  out.write(JSON.stringify(entry) + '\n');
}

export const log = {
  info:  (ctx: string, msg: string, data?: Record<string, unknown>) => write('info',  ctx, msg, data),
  warn:  (ctx: string, msg: string, data?: Record<string, unknown>) => write('warn',  ctx, msg, data),
  error: (ctx: string, msg: string, data?: Record<string, unknown>) => write('error', ctx, msg, data),
};
