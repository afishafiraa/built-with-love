import { renameSync } from 'node:fs';

// Vercel serves static index.html before rewrites; keep / on the dynamic handler.
renameSync('dist/index.html', 'dist/invitation-shell.html');
