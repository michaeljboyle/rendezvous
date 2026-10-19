import { SPEEDS } from '../state/clock';
import type { AppCtx } from './context';
import { h, icon, setText } from './dom';
import { countdown, met, metShort, num } from './format';

/** Playback controls, clock readout and scrubber. Pieces are placed by the layout. */
export class PlaybackBar {
  transport: HTMLElement;
  speeds: HTMLElement;
  speedCycle: HTMLButtonElement;
  clockEl: HTMLElement;
  scrubber: HTMLElement;
  private playBtn: HTMLButtonElement;
  private loopBtn: HTMLButtonElement;
  private speedBtns: HTMLButtonElement[];
  private metEl = h('span', { class: 'met' });
  private revEl = h('span');
  private nextEl = h('span', { class: 'met-next' });
  private stateEl = h('span');
  private subEl = h('span', { class: 'met-sub' }, this.revEl, this.nextEl, this.stateEl);
  private track: HTMLElement;
  private fill = h('div', { class: 'scrub-fill' });
  private thumb = h('div', { class: 'scrub-thumb', 'aria-hidden': 'true' });
  private marks = h('div', { class: 'scrub-marks' });
  private endLabel = h('span', { class: 'scrub-end' });
  private lastPlaying: boolean | null = null;

  constructor(private app: AppCtx) {
    const { clock, store } = app;
    const btn = (name: string, label: string, onclick: () => void, cls = 'icon-btn') =>
      h('button', { type: 'button', class: cls, 'aria-label': label, title: label, onclick }, icon(name, 18));
    this.playBtn = btn('play', 'Play (Space)', () => clock.toggle(), 'play-btn');
    this.loopBtn = btn('loop', 'Loop', () => clock.setLoop(!clock.loop), 'icon-btn toggle-btn');
    this.loopBtn.setAttribute('aria-pressed', 'false');
    this.transport = h(
      'div',
      { class: 'transport', role: 'group', 'aria-label': 'Playback' },
      btn('restart', 'Restart', () => clock.restart(), 'icon-btn btn-restart'),
      btn('prev', 'Previous burn (←)', () => clock.jumpPrev()),
      this.playBtn,
      btn('next', 'Next burn (→)', () => clock.jumpNext()),
      this.loopBtn,
    );
    this.speedBtns = SPEEDS.map((s) =>
      h('button', { type: 'button', class: 'seg-btn mono', 'aria-pressed': String(s === clock.speed), onclick: () => clock.setSpeed(s) }, `${s}×`),
    );
    this.speeds = h('div', { class: 'seg speeds', role: 'group', 'aria-label': 'Playback speed ([ / ])' }, ...this.speedBtns);
    this.speedCycle = h('button', {
      type: 'button',
      class: 'speed-cycle mono',
      'aria-label': 'Playback speed, click to change',
      onclick: () => {
        const i = SPEEDS.indexOf(clock.speed);
        clock.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
      },
    });
    this.clockEl = h('div', { class: 'clock', 'aria-live': 'off' }, this.metEl, this.subEl);

    this.track = h('div', { class: 'scrub-track' }, h('div', { class: 'scrub-rail' }), this.fill, this.marks, this.thumb);
    const slider = h(
      'div',
      { class: 'scrub-slider', role: 'slider', tabindex: '0', 'aria-label': 'Simulation time', 'aria-valuemin': '0' },
      this.track,
    );
    this.scrubber = h('div', { class: 'scrubber' }, h('span', { class: 'scrub-start' }, 'T+0:00'), slider, this.endLabel);

    // Pointer scrubbing
    let wasPlaying = false;
    const setFromPointer = (e: PointerEvent) => {
      const r = this.track.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      clock.setTime(f * clock.duration);
    };
    slider.addEventListener('pointerdown', (e) => {
      slider.setPointerCapture(e.pointerId);
      wasPlaying = clock.playing;
      clock.pause();
      setFromPointer(e);
      slider.dataset.dragging = '1';
    });
    slider.addEventListener('pointermove', (e) => {
      if (slider.dataset.dragging) setFromPointer(e);
    });
    const up = () => {
      if (!slider.dataset.dragging) return;
      delete slider.dataset.dragging;
      if (wasPlaying) clock.play();
    };
    slider.addEventListener('pointerup', up);
    slider.addEventListener('pointercancel', up);
    slider.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 600 : 60;
      let t: number | null = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') t = clock.t + step;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') t = clock.t - step;
      else if (e.key === 'PageUp') t = clock.t + 600;
      else if (e.key === 'PageDown') t = clock.t - 600;
      else if (e.key === 'Home') t = 0;
      else if (e.key === 'End') t = clock.duration;
      if (t !== null) {
        e.preventDefault();
        e.stopPropagation();
        clock.setTime(t);
      }
    });

    store.subscribe(() => this.rebuildMarks());
    clock.subscribe(() => this.syncControls());
    this.rebuildMarks();
    this.syncControls();
  }

  private rebuildMarks(): void {
    const tl = this.app.store.timeline;
    const D = tl.duration;
    this.marks.replaceChildren();
    for (let k = 1; k * tl.targetPeriod < D; k++) {
      const f = ((k * tl.targetPeriod) / D) * 100;
      this.marks.append(h('div', { class: 'scrub-rev', style: `left:${f}%`, title: `Rev ${k}` }), h('span', { class: 'scrub-rev-label', style: `left:${f}%` }, `Rev ${k}`));
    }
    for (const b of tl.burns) {
      const f = (b.tig / D) * 100;
      const burn = this.app.store.scenario.burns[b.index];
      this.marks.append(h('div', { class: 'scrub-burn', style: `left:${f}%`, title: `Burn ${this.app.store.numbers[b.index]} · ${burn.name}` }));
    }
    setText(this.endLabel, metShort(D));
    this.scrubber.querySelector('.scrub-slider')!.setAttribute('aria-valuemax', String(Math.round(D)));
  }

  private syncControls(): void {
    const { clock } = this.app;
    if (this.lastPlaying !== clock.playing) {
      this.lastPlaying = clock.playing;
      this.playBtn.replaceChildren(icon(clock.playing ? 'pause' : 'play', 18));
      const lab = clock.playing ? 'Pause (Space)' : 'Play (Space)';
      this.playBtn.setAttribute('aria-label', lab);
      this.playBtn.title = lab;
    }
    this.loopBtn.setAttribute('aria-pressed', String(clock.loop));
    SPEEDS.forEach((s, i) => this.speedBtns[i].setAttribute('aria-pressed', String(s === clock.speed)));
    setText(this.speedCycle, `${clock.speed}×`);
  }

  /** Per-frame update of the clock readout and scrubber position. */
  update(t: number): void {
    const { clock, store } = this.app;
    const D = store.timeline.duration;
    setText(this.metEl, met(t));
    const rev = t / store.timeline.targetPeriod;
    const next = clock.nextBurnTime(t);
    const eff = clock.effectiveSpeed(t);
    const slow = clock.playing && eff !== clock.speed ? ` · ${eff}× near burn` : '';
    setText(this.revEl, `Rev ${num(rev, 2)}`);
    setText(this.nextEl, next !== null ? ` · next burn in ${countdown(next - t)}` : '');
    setText(this.stateEl, !clock.playing ? ' · paused' : slow);
    const f = D > 0 ? (t / D) * 100 : 0;
    this.fill.style.width = `${f}%`;
    this.thumb.style.left = `${f}%`;
    const slider = this.scrubber.querySelector('.scrub-slider')!;
    slider.setAttribute('aria-valuenow', String(Math.round(t)));
    slider.setAttribute('aria-valuetext', met(t));
  }
}
