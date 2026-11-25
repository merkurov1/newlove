'use client';

import { Check, Minus, Plus } from 'lucide-react';

import {
  FLOW_READER_FONT_SCALE_MAX,
  FLOW_READER_FONT_SCALE_MIN,
  FLOW_READER_LINE_HEIGHT_MAX,
  FLOW_READER_LINE_HEIGHT_MIN,
  type FlowReaderPrefs,
  type FlowReaderTheme,
} from '@/lib/flow/readerState';

type Props = {
  prefs: FlowReaderPrefs;
  onChange: (patch: Partial<Omit<FlowReaderPrefs, 'version'>>) => void;
};

const THEMES: Array<{ value: FlowReaderTheme; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'dark', label: 'Dark' },
];

const FONT_STEP = 0.1;

/**
 * Presentational appearance controls. Persistence and validation stay in
 * `lib/flow/readerState`; this component only emits small patches.
 */
export default function FlowReaderSettings({ prefs, onChange }: Props) {
  const percent = `${Math.round(prefs.fontScale * 100)}%`;
  const canDecrease = prefs.fontScale > FLOW_READER_FONT_SCALE_MIN + 0.001;
  const canIncrease = prefs.fontScale < FLOW_READER_FONT_SCALE_MAX - 0.001;

  return (
    <div className="flow-reader-settings">
      <fieldset className="flow-reader-settings__group">
        <legend className="flow-reader-settings__legend">Theme</legend>

        <div className="flow-reader-settings__themes">
          {THEMES.map((theme) => (
            <button
              key={theme.value}
              type="button"
              className="flow-reader-settings__theme"
              aria-pressed={prefs.theme === theme.value}
              onClick={() => onChange({ theme: theme.value })}
            >
              {prefs.theme === theme.value && <Check size={13} aria-hidden="true" />}
              {theme.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flow-reader-settings__group">
        <div className="flow-reader-settings__row">
          <span className="flow-reader-settings__legend" id="flow-reader-size-label">
            Text size
          </span>
          <span className="flow-reader-settings__value" aria-live="polite">
            {percent}
          </span>
        </div>

        <div
          className="flow-reader-settings__stepper"
          role="group"
          aria-labelledby="flow-reader-size-label"
        >
          <button
            type="button"
            className="flow-reader-settings__step"
            onClick={() =>
              onChange({
                fontScale: Math.round((prefs.fontScale - FONT_STEP) * 100) / 100,
              })
            }
            disabled={!canDecrease}
            aria-label="Decrease text size"
          >
            <Minus size={16} aria-hidden="true" />
          </button>

          <span className="flow-reader-settings__step-divider" aria-hidden="true" />

          <button
            type="button"
            className="flow-reader-settings__step"
            onClick={() =>
              onChange({
                fontScale: Math.round((prefs.fontScale + FONT_STEP) * 100) / 100,
              })
            }
            disabled={!canIncrease}
            aria-label="Increase text size"
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flow-reader-settings__group">
        <div className="flow-reader-settings__row">
          <label className="flow-reader-settings__legend" htmlFor="flow-reader-line-height">
            Line spacing
          </label>
          <span className="flow-reader-settings__value">{prefs.lineHeight.toFixed(2)}</span>
        </div>

        <input
          id="flow-reader-line-height"
          className="flow-reader-settings__range"
          type="range"
          min={FLOW_READER_LINE_HEIGHT_MIN}
          max={FLOW_READER_LINE_HEIGHT_MAX}
          step={0.05}
          value={prefs.lineHeight}
          onChange={(event) => onChange({ lineHeight: Number(event.target.value) })}
        />
      </div>

      <p className="flow-reader-settings__note">
        Appearance stays on this device. Nothing about you is stored.
      </p>
    </div>
  );
}
