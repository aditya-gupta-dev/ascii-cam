import { type Settings } from "@/pages/ascii-cam";

type Props = {
  settings: Settings;
  camActive: boolean;
  onUpdate: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onStart: () => void;
  onStop: () => void;
};

const CHAR_SET_OPTIONS: { value: Settings["charSet"]; label: string }[] = [
  { value: "standard", label: "STANDARD" },
  { value: "extended", label: "EXTENDED" },
  { value: "blocks", label: "BLOCKS" },
  { value: "minimal", label: "MINIMAL" },
  { value: "binary", label: "BINARY" },
];

const COLOR_MODE_OPTIONS: { value: Settings["colorMode"]; label: string }[] = [
  { value: "solid", label: "SOLID" },
  { value: "grayscale", label: "GRAYSCALE" },
  { value: "rainbow", label: "RAINBOW" },
  { value: "heatmap", label: "HEATMAP" },
];

const PRESET_COLORS = [
  "#00ff41", // matrix green
  "#ff6b35", // orange
  "#00cfff", // cyan
  "#ff2d9e", // pink
  "#ffe44d", // yellow
  "#ffffff", // white
  "#a855f7", // purple
  "#ff4444", // red
];

const BG_PRESET_COLORS = [
  "#000000", "#0a0a0a", "#001100", "#000011", "#110000", "#001111",
];

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <label className="text-xs tracking-widest" style={{ color: "#00ff4199" }}>
          {label}
        </label>
        <span className="text-xs tabular-nums" style={{ color: "#00ff41" }}>
          {display ?? value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1.5 border tracking-widest transition-all"
      style={{
        borderColor: active ? "#00ff41" : "#00ff4133",
        color: active ? "#00ff41" : "#00ff4166",
        backgroundColor: active ? "#00ff4111" : "transparent",
        boxShadow: active ? "0 0 8px #00ff4133" : "none",
      }}
    >
      {label}
    </button>
  );
}

export default function ControlPanel({ settings, camActive, onUpdate, onStart, onStop }: Props) {
  return (
    <div
      className="shrink-0 border-t overflow-y-auto"
      style={{
        borderColor: "#00ff4133",
        backgroundColor: "rgba(0,0,0,0.95)",
        maxHeight: "clamp(200px, 40vh, 380px)",
      }}
    >
      {/* Top bar with cam controls */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: "#00ff4122" }}
      >
        <span className="text-xs tracking-widest" style={{ color: "#00ff4188" }}>
          CONTROLS
        </span>
        <div className="flex gap-2">
          {!camActive ? (
            <button
              onClick={onStart}
              className="text-xs px-4 py-1.5 border tracking-widest transition-all"
              style={{ borderColor: "#00ff41", color: "#00ff41" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#00ff4122")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              START
            </button>
          ) : (
            <button
              onClick={onStop}
              className="text-xs px-4 py-1.5 border tracking-widest transition-all"
              style={{ borderColor: "#ff4444", color: "#ff4444" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#ff444422")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              STOP
            </button>
          )}
        </div>
      </div>

      {/* Controls grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-3 p-4">
        {/* Image controls */}
        <div className="flex flex-col gap-3">
          <p className="text-xs tracking-widest uppercase" style={{ color: "#00ff4155" }}>
            IMAGE
          </p>
          <SliderControl
            label="CONTRAST"
            value={settings.contrast}
            min={0.1}
            max={3}
            step={0.05}
            onChange={(v) => onUpdate("contrast", v)}
            display={settings.contrast.toFixed(2)}
          />
          <SliderControl
            label="BRIGHTNESS"
            value={settings.brightness}
            min={0.1}
            max={3}
            step={0.05}
            onChange={(v) => onUpdate("brightness", v)}
            display={settings.brightness.toFixed(2)}
          />
          <div className="flex gap-2 flex-wrap">
            <ToggleButton
              label="MIRROR"
              active={settings.mirrorX}
              onClick={() => onUpdate("mirrorX", !settings.mirrorX)}
            />
            <ToggleButton
              label="INVERT"
              active={settings.invert}
              onClick={() => onUpdate("invert", !settings.invert)}
            />
          </div>
        </div>

        {/* Detail controls */}
        <div className="flex flex-col gap-3">
          <p className="text-xs tracking-widest uppercase" style={{ color: "#00ff4155" }}>
            DETAIL
          </p>
          <SliderControl
            label="FONT SIZE"
            value={settings.fontSize}
            min={4}
            max={20}
            step={1}
            onChange={(v) => onUpdate("fontSize", v)}
            display={`${settings.fontSize}px`}
          />
          <SliderControl
            label="RESOLUTION"
            value={settings.resolution}
            min={1}
            max={6}
            step={1}
            onChange={(v) => onUpdate("resolution", v)}
            display={`${settings.resolution}x`}
          />
        </div>

        {/* Color controls */}
        <div className="flex flex-col gap-3">
          <p className="text-xs tracking-widest uppercase" style={{ color: "#00ff4155" }}>
            COLOR
          </p>
          <div className="flex flex-col gap-1">
            <span className="text-xs tracking-widest" style={{ color: "#00ff4199" }}>
              TEXT COLOR
            </span>
            <div className="flex gap-1.5 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => onUpdate("textColor", c)}
                  className="w-5 h-5 rounded-sm transition-all"
                  style={{
                    backgroundColor: c,
                    outline: settings.textColor === c ? `2px solid ${c}` : "1px solid #333",
                    outlineOffset: "2px",
                    boxShadow: settings.textColor === c ? `0 0 8px ${c}` : "none",
                  }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={settings.textColor}
                onChange={(e) => onUpdate("textColor", e.target.value)}
                className="w-5 h-5 rounded-sm cursor-pointer border-0 p-0"
                style={{ backgroundColor: "transparent", outline: "1px solid #333" }}
                title="Custom color"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs tracking-widest" style={{ color: "#00ff4199" }}>
              BACKGROUND
            </span>
            <div className="flex gap-1.5 flex-wrap">
              {BG_PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => onUpdate("bgColor", c)}
                  className="w-5 h-5 rounded-sm transition-all"
                  style={{
                    backgroundColor: c,
                    outline: settings.bgColor === c ? "2px solid #00ff41" : "1px solid #333",
                    outlineOffset: "2px",
                  }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={settings.bgColor}
                onChange={(e) => onUpdate("bgColor", e.target.value)}
                className="w-5 h-5 rounded-sm cursor-pointer border-0 p-0"
                style={{ backgroundColor: "transparent", outline: "1px solid #333" }}
                title="Custom background"
              />
            </div>
          </div>
        </div>

        {/* Style controls */}
        <div className="flex flex-col gap-3">
          <p className="text-xs tracking-widest uppercase" style={{ color: "#00ff4155" }}>
            STYLE
          </p>
          <div className="flex flex-col gap-1">
            <span className="text-xs tracking-widest" style={{ color: "#00ff4199" }}>
              COLOR MODE
            </span>
            <div className="flex flex-wrap gap-1">
              {COLOR_MODE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => onUpdate("colorMode", o.value)}
                  className="text-xs px-2 py-1 border tracking-wider transition-all"
                  style={{
                    borderColor: settings.colorMode === o.value ? "#00ff41" : "#00ff4133",
                    color: settings.colorMode === o.value ? "#00ff41" : "#00ff4166",
                    backgroundColor: settings.colorMode === o.value ? "#00ff4111" : "transparent",
                    fontSize: "10px",
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs tracking-widest" style={{ color: "#00ff4199" }}>
              CHAR SET
            </span>
            <div className="flex flex-wrap gap-1">
              {CHAR_SET_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => onUpdate("charSet", o.value)}
                  className="text-xs px-2 py-1 border tracking-wider transition-all"
                  style={{
                    borderColor: settings.charSet === o.value ? "#00ff41" : "#00ff4133",
                    color: settings.charSet === o.value ? "#00ff41" : "#00ff4166",
                    backgroundColor: settings.charSet === o.value ? "#00ff4111" : "transparent",
                    fontSize: "10px",
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <ToggleButton
              label="GLOW"
              active={settings.glowEffect}
              onClick={() => onUpdate("glowEffect", !settings.glowEffect)}
            />
            <ToggleButton
              label="SCANLINES"
              active={settings.scanlines}
              onClick={() => onUpdate("scanlines", !settings.scanlines)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
