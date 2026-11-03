import { LANE_BY_CODE } from "./constants";
import type { LaneIndex } from "./types";

export type GameCommand = "pause" | "escape" | "restart" | "enter";

export interface KeyEventLike {
  code: string;
  repeat: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  preventDefault(): void;
}

export interface InputHandlers {
  onLaneDown(lane: LaneIndex): void;
  onLaneUp(lane: LaneIndex): void;
  onCommand(cmd: GameCommand): void;
}

const COMMAND_BY_CODE: Record<string, GameCommand> = {
  Space: "pause",
  Escape: "escape",
  KeyR: "restart",
  Enter: "enter",
  NumpadEnter: "enter",
};

/**
 * Keyboard → game events. Pure (no DOM access) so it can be unit-tested.
 *  - uses `code`, so it works with any keyboard layout and with a Korean IME switched on
 *  - ignores OS auto-repeat (`repeat`) and any key already held (a second guard in case `repeat` is unreliable)
 *  - supports any number of simultaneous lane keys
 *  - preventDefault() on game keys so the browser never scrolls / clicks a focused button / searches
 */
export class GameInput {
  private down = new Set<LaneIndex>();
  private commandsDown = new Set<string>();

  constructor(private readonly handlers: InputHandlers) {}

  isDown(lane: LaneIndex): boolean {
    return this.down.has(lane);
  }

  keydown(e: KeyEventLike) {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts (reload, devtools…) alone
    const lane = LANE_BY_CODE[e.code];
    if (lane !== undefined) {
      e.preventDefault();
      if (e.repeat || this.down.has(lane)) return;
      this.down.add(lane);
      this.handlers.onLaneDown(lane);
      return;
    }
    const cmd = COMMAND_BY_CODE[e.code];
    if (cmd) {
      e.preventDefault();
      if (e.repeat || this.commandsDown.has(e.code)) return;
      this.commandsDown.add(e.code);
      this.handlers.onCommand(cmd);
    }
  }

  keyup(e: KeyEventLike) {
    const lane = LANE_BY_CODE[e.code];
    if (lane !== undefined) {
      e.preventDefault();
      if (this.down.delete(lane)) this.handlers.onLaneUp(lane);
      return;
    }
    if (COMMAND_BY_CODE[e.code]) {
      e.preventDefault();
      this.commandsDown.delete(e.code);
    }
  }

  /** Forget all held keys (pause, blur, screen change). Releases are reported so holds end cleanly. */
  reset(notifyReleases = false) {
    const held = [...this.down];
    this.down.clear();
    this.commandsDown.clear();
    if (notifyReleases) for (const lane of held) this.handlers.onLaneUp(lane);
  }
}
