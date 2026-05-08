"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = void 0;
function write(level, context, msg, data) {
    const entry = {
        ts: new Date().toISOString(),
        level,
        context,
        msg,
        ...data,
    };
    const out = level === 'error' ? process.stderr : process.stdout;
    out.write(JSON.stringify(entry) + '\n');
}
exports.log = {
    info: (ctx, msg, data) => write('info', ctx, msg, data),
    warn: (ctx, msg, data) => write('warn', ctx, msg, data),
    error: (ctx, msg, data) => write('error', ctx, msg, data),
};
