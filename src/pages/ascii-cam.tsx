import { useRef, useEffect, useState, useCallback } from "react";
import ControlPanel from "@/components/custom/control-panel";

export type Settings = {
  contrast: number;
  brightness: number;
  resolution: number;
  fontSize: number;
  textColor: string;
  bgColor: string;
  charSet: "standard" | "extended" | "blocks" | "minimal" | "binary";
  mirrorX: boolean;
  invert: boolean;
  colorMode: "solid" | "grayscale" | "rainbow" | "heatmap";
  glowEffect: boolean;
  scanlines: boolean;
};

const CHAR_SETS = {
  standard: " .,:;i1tfLCG08@",
  extended: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: " ░▒▓█",
  minimal: " .-+*#@",
  binary: " 01",
};

const DEFAULT_SETTINGS: Settings = {
  contrast: 1.0,
  brightness: 1.0,
  resolution: 2,
  fontSize: 8,
  textColor: "#00ff41",
  bgColor: "#000000",
  charSet: "standard",
  mirrorX: false,
  invert: false,
  colorMode: "solid",
  glowEffect: true,
  scanlines: true,
};

function getAsciiChar(brightness: number, chars: string): string {
  const idx = Math.floor((brightness / 255) * (chars.length - 1));
  return chars[Math.max(0, Math.min(chars.length - 1, idx))] ?? ""; // avoided undefined
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1]!, 16), parseInt(result[2]!, 16), parseInt(result[3]!, 16)]
    : [0, 255, 65]; // avoided undefined
}

function getColorForBrightness(brightness: number, mode: Settings["colorMode"], textColor: string): string {
  if (mode === "solid") return textColor;
  if (mode === "grayscale") {
    const v = Math.round(brightness);
    return `rgb(${v},${v},${v})`;
  }
  if (mode === "rainbow") {
    const hue = Math.round((brightness / 255) * 360);
    return `hsl(${hue}, 100%, 55%)`;
  }
  if (mode === "heatmap") {
    if (brightness < 85) {
      const t = brightness / 85;
      return `rgb(0,${Math.round(t * 255)},255)`;
    } else if (brightness < 170) {
      const t = (brightness - 85) / 85;
      return `rgb(${Math.round(t * 255)},255,${Math.round((1 - t) * 255)})`;
    } else {
      const t = (brightness - 170) / 85;
      return `rgb(255,${Math.round((1 - t) * 255)},0)`;
    }
  }
  return textColor;
}

export default function AsciiCam() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const asciiRef = useRef<HTMLPreElement>(null);
  const animFrameRef = useRef<number>(0);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [camActive, setCamActive] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const lastFpsTime = useRef(Date.now());
  const frameCount = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const startCamera = useCallback(async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCamActive(true);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setCamError(err.message.includes("Permission") ? "Camera permission denied. Please allow camera access." : err.message);
      } else {
        setCamError("Could not access camera.");
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCamActive(false);
    cancelAnimationFrame(animFrameRef.current);
    if (asciiRef.current) {
      asciiRef.current.innerHTML = "";
    }
  }, []);

  const renderFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const pre = asciiRef.current;
    if (!video || !canvas || !pre || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    const s = settingsRef.current;
    const chars = CHAR_SETS[s.charSet];
    const step = s.resolution;
    const fontSize = s.fontSize;

    const containerW = pre.parentElement?.clientWidth || 800;
    const containerH = pre.parentElement?.clientHeight || 600;
    const cols = Math.floor(containerW / (fontSize * 0.6));
    const rows = Math.floor(containerH / (fontSize * 1.2));

    canvas.width = cols * step;
    canvas.height = rows * step;

    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    ctx.save();
    if (s.mirrorX) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    let html = "";
    const [tr, tg, tb] = hexToRgb(s.textColor);
    const contrastFactor = s.contrast;
    const brightFactor = s.brightness;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const px = (row * step * canvas.width + col * step) * 4;
        let r = data[px];
        let g = data[px + 1];
        let b = data[px + 2];

        // avoided undefined 
        r = Math.min(255, r! * brightFactor);
        g = Math.min(255, g! * brightFactor);
        b = Math.min(255, b! * brightFactor);

        let lum = 0.299 * r + 0.587 * g + 0.114 * b;

        lum = Math.min(255, Math.max(0, ((lum - 128) * contrastFactor) + 128));

        if (s.invert) lum = 255 - lum;

        const char = getAsciiChar(lum, chars);
        const color = getColorForBrightness(lum, s.colorMode, s.textColor);

        if (s.colorMode === "solid") {
          const alpha = Math.round((lum / 255) * 100 + 5) / 100;
          html += `<span style="color:rgba(${tr},${tg},${tb},${Math.min(1, alpha + 0.3)})">${char === " " ? "&nbsp;" : char}</span>`;
        } else {
          html += `<span style="color:${color}">${char === " " ? "&nbsp;" : char}</span>`;
        }
      }
      html += "\n";
    }

    pre.innerHTML = html;

    frameCount.current++;
    const now = Date.now();
    if (now - lastFpsTime.current >= 1000) {
      setFps(frameCount.current);
      frameCount.current = 0;
      lastFpsTime.current = now;
    }

    animFrameRef.current = requestAnimationFrame(renderFrame);
  }, []);

  useEffect(() => {
    if (camActive) {
      animFrameRef.current = requestAnimationFrame(renderFrame);
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [camActive, renderFrame]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    <div
      className="flex flex-col min-h-screen w-full"
      style={{ backgroundColor: settings.bgColor, fontFamily: "'Share Tech Mono', 'Courier New', monospace" }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-2 border-b shrink-0"
        style={{ borderColor: "#00ff4133", backgroundColor: "rgba(0,0,0,0.8)" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-widest" style={{ color: "#00ff41", textShadow: "0 0 8px #00ff41" }}>
            ASCII<span style={{ color: "#00cc33" }}>CAM</span>
          </span>
          <span className="text-xs hidden sm:inline" style={{ color: "#00ff4166" }}>
            LIVE FEED
          </span>
        </div>
        <div className="flex items-center gap-4">
          {camActive && (
            <span className="text-xs tabular-nums" style={{ color: "#00ff4199" }}>
              {fps} FPS
            </span>
          )}
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{
                backgroundColor: camActive ? "#00ff41" : "#444",
                boxShadow: camActive ? "0 0 6px #00ff41" : "none",
              }}
            />
            <span className="text-xs" style={{ color: camActive ? "#00ff41" : "#666" }}>
              {camActive ? "RECORDING" : "OFFLINE"}
            </span>
          </div>
        </div>
      </header>

      {/* Main area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* ASCII display area */}
        <div
          className={`relative flex-1 overflow-hidden ${settings.scanlines ? "scanlines" : ""}`}
          style={{ backgroundColor: settings.bgColor, minHeight: "200px" }}
        >
          {!camActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 z-10">
              {camError ? (
                <div className="text-center px-4">
                  <p className="text-red-400 text-sm mb-4">{camError}</p>
                  <button
                    onClick={startCamera}
                    className="px-6 py-2 border text-sm font-mono tracking-widest transition-all"
                    style={{ borderColor: "#00ff41", color: "#00ff41" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#00ff4122";
                      e.currentTarget.style.boxShadow = "0 0 12px #00ff4166";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    RETRY
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-center">
                    <pre
                      className="text-xs leading-tight mb-4 hidden sm:block"
                      style={{ color: "#00ff4144" }}
                    >{`  ██████╗ █████╗ ███╗   ███╗
 ██╔════╝██╔══██╗████╗ ████║
 ██║     ███████║██╔████╔██║
 ██║     ██╔══██║██║╚██╔╝██║
 ╚██████╗██║  ██║██║ ╚═╝ ██║`}</pre>
                    <p className="text-sm mb-2" style={{ color: "#00ff4188" }}>
                      ASCII WEBCAM ART GENERATOR
                    </p>
                    <p className="text-xs" style={{ color: "#00ff4144" }}>
                      Press START CAMERA to begin
                    </p>
                  </div>
                  <button
                    onClick={startCamera}
                    className="px-8 py-3 border text-sm font-mono tracking-widest transition-all"
                    style={{ borderColor: "#00ff41", color: "#00ff41" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#00ff4122";
                      e.currentTarget.style.boxShadow = "0 0 20px #00ff4166";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    [ START CAMERA ]
                  </button>
                </>
              )}
            </div>
          )}
          <pre
            ref={asciiRef}
            className={`absolute inset-0 overflow-hidden select-none leading-none ${settings.glowEffect ? "ascii-glow" : ""}`}
            style={{
              fontSize: `${settings.fontSize}px`,
              lineHeight: `${settings.fontSize * 1.2}px`,
              color: settings.textColor,
              backgroundColor: settings.bgColor,
              padding: 0,
              margin: 0,
              whiteSpace: "pre",
            }}
          />
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Control panel */}
        <ControlPanel
          settings={settings}
          camActive={camActive}
          onUpdate={updateSetting}
          onStart={startCamera}
          onStop={stopCamera}
        />
      </div>
    </div>
  );
}
