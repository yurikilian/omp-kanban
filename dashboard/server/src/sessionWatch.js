import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';

class SessionWatcher extends EventEmitter {
  constructor() {
    super();
    this.watchRoot = path.join(os.homedir(), '.omp', 'agent', 'sessions');
    this.watcher = null;
    this.debounceTimer = null;
    this.debounceMs = 300;
    this.watching = false;
    this.pendingIds = new Set();
  }

  start() {
    if (this.watching) return; // Idempotent

    try {
      if (!fs.existsSync(this.watchRoot)) {
        console.log(`Session watch root not found: ${this.watchRoot}, will watch when available`);
        // Start watching anyway; fs.watch will handle non-existent directories gracefully
      }

      this.watcher = fs.watch(this.watchRoot, { recursive: true }, (event, filename) => {
        if (!filename) return;

        // filename is relative to watchRoot: "<project>/<stem>.jsonl" for a
        // top-level session, or "<project>/<stem>/<agent>.jsonl" for a
        // nested sub-task log (Oh My Pi writes hub-spawned sub-agent
        // transcripts into a directory named after the parent session's
        // stem). In both cases the VIEWER session id is the stem at
        // parts[1], not the project directory name at parts[0].
        const parts = filename.split(path.sep).filter((p) => p);
        if (parts.length < 2) return;

        let sessionId = parts[1];
        if (sessionId.endsWith('.jsonl')) sessionId = sessionId.slice(0, -6);
        if (!sessionId) return;

        this.pendingIds.add(sessionId);
        this.scheduleEmit();
      });

      this.watching = true;
      console.log(`Session watcher started: ${this.watchRoot}`);
    } catch (err) {
      console.error('Failed to start session watcher:', err.message);
      // No-op on error
    }
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    clearTimeout(this.debounceTimer);
    this.debounceTimer = null;

    this.watching = false;
    this.pendingIds.clear();
  }

  scheduleEmit() {
    clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      const ids = Array.from(this.pendingIds);
      this.pendingIds.clear();

      // Emit with ids and list=true (any change marks list dirty)
      this.emit('change', { ids, list: true });
    }, this.debounceMs);
  }
}

export const sessionWatcher = new SessionWatcher();
