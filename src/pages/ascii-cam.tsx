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
  const canvasRef = useRef<HTMLCanvasElement>(null); // Low-res processing canvas
  const outputCanvasRef = useRef<HTMLCanvasElement>(null); // High-speed display canvas
  const atlasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animFrameRef = useRef<number>(0);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [camActive, setCamActive] = useState(false);
  const [uploadedImg, setUploadedImg] = useState<HTMLImageElement | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);

  // Pre-render characters to an atlas for GPU-accelerated drawing
  const createAtlas = useCallback((s: Settings) => {
    const chars = CHAR_SETS[s.charSet];
    const fontSize = 24; 
    const atlas = document.createElement("canvas");
    const ctx = atlas.getContext("2d")!;
    const charW = fontSize * 0.6;
    const charH = fontSize;
    
    atlas.width = charW * chars.length;
    atlas.height = charH;
    
    ctx.fillStyle = s.textColor; // Use the actual text color directly in the atlas
    ctx.font = `${fontSize}px 'Share Tech Mono', 'Courier New', monospace`;
    ctx.textBaseline = "top";
    
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i]!, i * charW, 0);
    }
    atlasRef.current = atlas;
  }, []);

  useEffect(() => {
    createAtlas(settings);
  }, [settings.charSet, settings.textColor, createAtlas]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setUploadedImg(img);
        setCamActive(false); // Stop camera if an image is uploaded
        stopCamera();
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, []);
  const lastFpsTime = useRef(Date.now());
  const frameCount = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const startCamera = useCallback(async () => {
    setCamError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCamError("Camera API not supported in this browser or context.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      
      const video = videoRef.current || document.createElement("video");
      if (!videoRef.current) {
        video.playsInline = true;
        video.muted = true;
        videoRef.current = video;
      }
      
      video.srcObject = stream;
      
      const onVideoReady = () => {
        video.play().catch(e => {
          console.error("Error playing video:", e);
          setCamError("Error playing video feed.");
        });
        setCamActive(true);
      };

      if (video.readyState >= 1) {
        onVideoReady();
      } else {
        video.onloadedmetadata = onVideoReady;
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        const msg = err.name === "NotAllowedError" || err.message.includes("Permission")
          ? "Camera permission denied. Please allow camera access."
          : `Could not access camera: ${err.message}`;
        setCamError(msg);
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
    
    // Clear the output canvas when stopping
    if (outputCanvasRef.current) {
      const ctx = outputCanvasRef.current.getContext("2d");
      if (ctx) {
        ctx.fillStyle = settingsRef.current.bgColor;
        ctx.fillRect(0, 0, outputCanvasRef.current.width, outputCanvasRef.current.height);
      }
    }
  }, []);

  const renderFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const outCanvas = outputCanvasRef.current;
    const atlas = atlasRef.current;
    
    const source = camActive ? video : uploadedImg;
    
    if (!source || !canvas || !outCanvas || !atlas) {
      if (camActive) animFrameRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    if (source instanceof HTMLVideoElement && source.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    const s = settingsRef.current;
    const fontSize = s.fontSize;
    const charW = fontSize * 0.6;
    const charH = fontSize * 1.2;

    const containerW = outCanvas.parentElement?.clientWidth || 800;
    const containerH = outCanvas.parentElement?.clientHeight || 600;
    
    const dpr = window.devicePixelRatio || 1;
    const cols = Math.floor(containerW / charW);
    const rows = Math.floor(containerH / charH);

    if (outCanvas.width !== containerW * dpr || outCanvas.height !== containerH * dpr) {
      outCanvas.width = containerW * dpr;
      outCanvas.height = containerH * dpr;
      outCanvas.style.width = `${containerW}px`;
      outCanvas.style.height = `${containerH}px`;
    }
    
    canvas.width = cols;
    canvas.height = rows;

    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const outCtx = outCanvas.getContext("2d", { alpha: false })!;
    
    outCtx.save();
    outCtx.scale(dpr, dpr);

    ctx.save();
    if (s.mirrorX) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    
    ctx.filter = `brightness(${s.brightness}) contrast(${s.contrast}) ${s.invert ? "invert(1)" : ""}`;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    outCtx.fillStyle = s.bgColor;
    outCtx.fillRect(0, 0, containerW, containerH);

    const chars = CHAR_SETS[s.charSet];
    const atlasFontSize = 24;
    const atlasCharW = atlasFontSize * 0.6;
    const atlasCharH = atlasFontSize;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const px = (row * canvas.width + col) * 4;
        const r = data[px] ?? 0;
        const g = data[px + 1] ?? 0;
        const b = data[px + 2] ?? 0;

        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const charIdx = Math.floor((lum / 255) * (chars.length - 1));
        
        outCtx.drawImage(
          atlas,
          charIdx * atlasCharW, 0, atlasCharW, atlasCharH,
          col * charW, row * charH, charW, charH
        );
      }
    }

    if (s.scanlines) {
      outCtx.fillStyle = "rgba(0,0,0,0.2)";
      for (let i = 0; i < containerH; i += 4) {
        outCtx.fillRect(0, i, containerW, 1);
      }
    }
    
    outCtx.restore();

    if (camActive) {
      frameCount.current++;
      const now = Date.now();
      if (now - lastFpsTime.current >= 1000) {
        setFps(frameCount.current);
        frameCount.current = 0;
        lastFpsTime.current = now;
      }
      animFrameRef.current = requestAnimationFrame(renderFrame);
    }
  }, [camActive, uploadedImg]);

  useEffect(() => {
    if (camActive || uploadedImg) {
      renderFrame();
    }
  }, [camActive, uploadedImg, settings, renderFrame]);

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

  const downloadPng = useCallback(() => {
    const canvas = outputCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `ascii-art-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, []);

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
          {!camActive && !uploadedImg && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 z-10 p-4">
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
                    RETRY CAMERA
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-center">
                    <pre
                      className="text-[10px] leading-tight mb-4 hidden sm:block"
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
                      CHOOSE A SOURCE TO BEGIN
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
                    <button
                      onClick={startCamera}
                      className="flex-1 px-8 py-4 border text-sm font-mono tracking-widest transition-all"
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
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 px-8 py-4 border text-sm font-mono tracking-widest transition-all"
                      style={{ borderColor: "#00cfff", color: "#00cfff" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#00cfff22";
                        e.currentTarget.style.boxShadow = "0 0 20px #00cfff66";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      [ UPLOAD IMAGE ]
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </div>
                </>
              )}
            </div>
          )}
          {uploadedImg && !camActive && (
            <div className="absolute top-4 right-4 z-20">
              <button
                onClick={() => {
                  setUploadedImg(null);
                  if (outputCanvasRef.current) {
                    const ctx = outputCanvasRef.current.getContext("2d");
                    if (ctx) {
                      ctx.fillStyle = settings.bgColor;
                      ctx.fillRect(0, 0, outputCanvasRef.current.width, outputCanvasRef.current.height);
                    }
                  }
                }}
                className="px-4 py-1.5 border text-xs font-mono tracking-widest transition-all"
                style={{ borderColor: "#ff4444", color: "#ff4444", backgroundColor: "rgba(0,0,0,0.7)" }}
              >
                CLEAR IMAGE
              </button>
            </div>
          )}
          <canvas
            ref={outputCanvasRef}
            className={`absolute inset-0 select-none ${settings.glowEffect ? "ascii-glow" : ""}`}
            style={{
              backgroundColor: settings.bgColor,
              padding: 0,
              margin: 0,
            }}
          />
          <video ref={videoRef} className="hidden" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Control panel */}
        <ControlPanel
          settings={settings}
          camActive={camActive}
          hasContent={camActive || !!uploadedImg}
          onUpdate={updateSetting}
          onStart={startCamera}
          onStop={stopCamera}
          onDownload={downloadPng}
        />
      </div>
    </div>
  );
}
