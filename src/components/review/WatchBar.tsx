"use client";

export type Speed = 1 | 2 | 4;

export interface WatchState {
  on: boolean;
  playing: boolean;
  speed: Speed;
  /** How many turns are visible while watching. */
  visible: number;
}

interface Props {
  state: WatchState;
  total: number;
  currentTurnId: string | null;
  hasInterrupt: boolean;
  locked: boolean;
  onStart: (speed: Speed) => void;
  onToggle: () => void;
  onStep: (delta: number) => void;
  onSpeed: (speed: Speed) => void;
  onInterrupt: () => void;
  onExit: () => void;
}

const btn =
  "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40";

export function WatchBar(props: Props) {
  const { state } = props;
  const speeds: Speed[] = [1, 2, 4];
  return (
    <div className="flex items-center gap-2" data-testid="watch-bar">
      {!state.on ? (
        <>
          <button type="button" data-testid="watch" onClick={() => props.onStart(state.speed)} className={`${btn} border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
              <path d="M4 2.8v10.4a.6.6 0 0 0 .9.5l8.3-5.2a.6.6 0 0 0 0-1L4.9 2.3a.6.6 0 0 0-.9.5Z" />
            </svg>
            Watch
          </button>
          <SpeedPicker speeds={speeds} value={state.speed} onChange={props.onSpeed} />
        </>
      ) : (
        <>
          <button type="button" data-testid="watch-toggle" onClick={props.onToggle} className={`${btn} border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}>
            {state.playing ? "Pause" : state.visible >= props.total ? "Done" : "Resume"}
          </button>
          <button type="button" aria-label="Previous turn" onClick={() => props.onStep(-1)} disabled={state.visible <= 1} className={`${btn} border-slate-300 bg-white px-2 text-slate-700 hover:bg-slate-50`}>
            ←
          </button>
          <button type="button" aria-label="Next turn" onClick={() => props.onStep(1)} disabled={state.visible >= props.total} className={`${btn} border-slate-300 bg-white px-2 text-slate-700 hover:bg-slate-50`}>
            →
          </button>
          <SpeedPicker speeds={speeds} value={state.speed} onChange={props.onSpeed} />
          <span className="font-mono text-xs text-slate-500" data-testid="watch-position">
            {props.currentTurnId} / t{props.total}
          </span>
          <button
            type="button"
            data-testid="interrupt"
            onClick={props.onInterrupt}
            disabled={props.hasInterrupt || props.locked}
            title={props.hasInterrupt ? "One interrupt per session. Clear the pin first." : "Mark where you would stop the agent (I)"}
            className={`${btn} border-fuchsia-300 bg-fuchsia-600 text-white hover:bg-fuchsia-700`}
          >
            Interrupt
            <kbd className="rounded bg-white/20 px-1 font-mono text-[10px]">I</kbd>
          </button>
          <button type="button" onClick={props.onExit} className={`${btn} border-transparent text-slate-500 hover:text-slate-800`}>
            Exit
          </button>
        </>
      )}
    </div>
  );
}

function SpeedPicker({ speeds, value, onChange }: { speeds: Speed[]; value: Speed; onChange: (s: Speed) => void }) {
  return (
    <div className="inline-flex h-8 overflow-hidden rounded-md border border-slate-300 bg-white" role="radiogroup" aria-label="Replay speed">
      {speeds.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          data-testid={`speed-${s}`}
          onClick={() => onChange(s)}
          className={`px-2 text-xs font-medium ${value === s ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          {s}x
        </button>
      ))}
    </div>
  );
}
