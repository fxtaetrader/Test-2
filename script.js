// UI elements
const video = document.getElementById("video");
const videoInput = document.getElementById("videoInput");
const exportBtn = document.getElementById("exportBtn");

const panel = document.getElementById("panel");
const panelTitle = document.getElementById("panelTitle");
const closePanel = document.getElementById("closePanel");
const statusEl = document.getElementById("status");

const engineText = document.getElementById("engineText");
const enginePercent = document.getElementById("enginePercent");
const barFill = document.getElementById("barFill");

// Controls
const trimStartEl = document.getElementById("trimStart");
const trimEndEl = document.getElementById("trimEnd");

const ratioEl = document.getElementById("ratio");
const filterEl = document.getElementById("filter");

const enhanceOnEl = document.getElementById("enhanceOn");

const textEl = document.getElementById("text");
const textXEl = document.getElementById("textX");
const textYEl = document.getElementById("textY");
const textSizeEl = document.getElementById("textSize");

const imageInput = document.getElementById("imageInput");
const removeBgBtn = document.getElementById("removeBgBtn");
const downloadStickerBtn = document.getElementById("downloadStickerBtn");
const stickerCanvas = document.getElementById("stickerCanvas");

const imgXEl = document.getElementById("imgX");
const imgYEl = document.getElementById("imgY");

const voiceEl = document.getElementById("voice");

// Bottom tools
const toolBtns = document.querySelectorAll(".tool");
const panelBodies = document.querySelectorAll(".panel-body");

// State
let videoFile = null;
let stickerFile = null;
let stickerPngBlob = null;

// FFmpeg
const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({
  log: false,
  progress: (p) => {
    // Export progress (not exact but helpful)
    if (p && typeof p.ratio === "number") {
      const percent = Math.min(99, Math.max(0, Math.floor(p.ratio * 100)));
      setStatus(`Exporting... ${percent}%`);
    }
  }
});

function setStatus(msg) {
  statusEl.textContent = msg;
}

// -----------------------------
// Panel switching (InShot-like)
// -----------------------------
function openPanel(name) {
  panelBodies.forEach(b => b.classList.add("hidden"));
  const el = document.querySelector(`.panel-body[data-panel="${name}"]`);
  if (el) el.classList.remove("hidden");

  toolBtns.forEach(btn => btn.classList.remove("active"));
  const tool = document.querySelector(`.tool[data-open="${name}"]`);
  if (tool) tool.classList.add("active");

  panelTitle.textContent = name.charAt(0).toUpperCase() + name.slice(1);
}

toolBtns.forEach(btn => {
  btn.addEventListener("click", () => openPanel(btn.dataset.open));
});

closePanel.addEventListener("click", () => {
  // Just collapse by showing upload panel
  openPanel("upload");
});

// -----------------------------
// Instant loading improvement
// -----------------------------
function setEngineProgress(percent, text) {
  barFill.style.width = `${percent}%`;
  enginePercent.textContent = `${percent}%`;
  engineText.textContent = text;
}

async function preloadEngine() {
  try {
    setEngineProgress(5, "Engine: preparing...");
    // Force load in background
    await ffmpeg.load();
    setEngineProgress(100, "Engine: ready ✅");
  } catch (e) {
    console.log(e);
    setEngineProgress(0, "Engine: failed to load (check internet)");
  }
}

// Start loading instantly when page opens
preloadEngine();

// -----------------------------
// Video load
// -----------------------------
videoInput.addEventListener("change", (e) => {
  videoFile = e.target.files?.[0] || null;

  if (!videoFile) {
    exportBtn.disabled = true;
    setStatus("No video selected.");
    return;
  }

  video.src = URL.createObjectURL(videoFile);
  exportBtn.disabled = false;
  setStatus("Video ready ✅ Choose tools below.");
});

// -----------------------------
// Filters
// -----------------------------
function getFilterFFmpeg(name) {
  if (name === "vivid") return "eq=contrast=1.2:saturation=1.35:brightness=0.02";
  if (name === "cinema") return "eq=contrast=1.25:saturation=1.15:brightness=-0.02";
  if (name === "bw") return "hue=s=0";
  if (name === "warm") return "eq=contrast=1.1:saturation=1.2, colorbalance=rs=0.05:gs=0.02:bs=-0.03";
  if (name === "cool") return "eq=contrast=1.1:saturation=1.15, colorbalance=rs=-0.03:gs=0.01:bs=0.05";
  return null;
}

function getCropForRatio(ratio) {
  if (ratio === "16:9") return "crop='if(gt(a,16/9),ih*16/9,iw)':'if(gt(a,16/9),ih,iw*9/16)'";
  if (ratio === "9:16") return "crop='if(gt(a,9/16),ih*9/16,iw)':'if(gt(a,9/16),ih,iw*16/9)'";
  if (ratio === "1:1") return "crop='min(iw,ih)':'min(iw,ih)'";
  return null;
}

// -----------------------------
// Auto Enhance
// -----------------------------
function getEnhanceChain(enabled) {
  if (!enabled) return null;

  // A clean enhancement chain:
  // - mild denoise
  // - sharpen
  // - contrast boost
  return "hqdn3d=1.5:1.5:6:6,unsharp=5:5:0.8:3:3:0.4,eq=contrast=1.18:brightness=0.01:saturation=1.10";
}

// -----------------------------
// Voice templates (FFmpeg audio)
// -----------------------------
function getVoiceFilter(voiceName) {
  if (voiceName === "robot") {
    // robotic effect: pitch + distortion style
    return "afftfilt=real='hypot(re,im)':imag='0',atempo=1.0";
  }
  if (voiceName === "deep") {
    // deeper voice (lower pitch)
    return "asetrate=44100*0.85,atempo=1.176";
  }
  if (voiceName === "chipmunk") {
    // higher pitch
    return "asetrate=44100*1.25,atempo=0.8";
  }
  if (voiceName === "echo") {
    return "aecho=0.8:0.9:1000:0.3";
  }
  return null;
}

// -----------------------------
// Sticker background remover (client-side)
// -----------------------------
imageInput.addEventListener("change", async (e) => {
  stickerFile = e.target.files?.[0] || null;
  stickerPngBlob = null;
  downloadStickerBtn.classList.add("hidden");
  stickerCanvas.classList.add("hidden");

  if (!stickerFile) {
    removeBgBtn.disabled = true;
    setStatus("No image selected.");
    return;
  }

  removeBgBtn.disabled = false;
  setStatus("Sticker image loaded. Tap Remove Background.");
});

removeBgBtn.addEventListener("click", async () => {
  if (!stickerFile) return;

  setStatus("Removing background...");

  const img = new Image();
  img.onload = () => {
    const maxW = 900;
    const scale = Math.min(1, maxW / img.width);

    const w = Math.floor(img.width * scale);
    const h = Math.floor(img.height * scale);

    stickerCanvas.width = w;
    stickerCanvas.height = h;

    const ctx = stickerCanvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // Basic background removal:
    // assumes background is close to corners
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    // Sample corner pixels to guess background color
    const corners = [
      [0, 0],
      [w - 1, 0],
      [0, h - 1],
      [w - 1, h - 1]
    ];

    let r = 0, g = 0, b = 0;
    corners.forEach(([x, y]) => {
      const i = (y * w + x) * 4;
      r += d[i]; g += d[i + 1]; b += d[i + 2];
    });
    r /= corners.length;
    g /= corners.length;
    b /= corners.length;

    // Remove pixels close to that color
    const threshold = 45;

    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - r;
      const dg = d[i + 1] - g;
      const db = d[i + 2] - b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);

      if (dist < threshold) {
        d[i + 3] = 0; // transparent
      }
    }

    ctx.putImageData(imgData, 0, 0);

    stickerCanvas.classList.remove("hidden");

    stickerCanvas.toBlob((blob) => {
      stickerPngBlob = blob;
      downloadStickerBtn.classList.remove("hidden");
      setStatus("Sticker ready ✅ You can export or download it.");
    }, "image/png");
  };

  img.src = URL.createObjectURL(stickerFile);
});

downloadStickerBtn.addEventListener("click", () => {
  if (!stickerPngBlob) return;

  const url = URL.createObjectURL(stickerPngBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nexus_sticker.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
});

// -----------------------------
// Export
// -----------------------------
exportBtn.addEventListener("click", async () => {
  if (!videoFile) return;

  exportBtn.disabled = true;

  try {
    if (!ffmpeg.isLoaded()) {
      setEngineProgress(10, "Engine: loading...");
      await ffmpeg.load();
      setEngineProgress(100, "Engine: ready ✅");
    }

    setStatus("Preparing video...");

    // Write video
    ffmpeg.FS("writeFile", "input.mp4", await fetchFile(videoFile));

    // Sticker if available
    const useSticker = !!stickerPngBlob;
    if (useSticker) {
      ffmpeg.FS("writeFile", "sticker.png", await fetchFile(stickerPngBlob));
    }

    const trimStart = parseFloat(trimStartEl.value || "0");
    const trimEnd = trimEndEl.value === "" ? null : parseFloat(trimEndEl.value);

    const ratio = ratioEl.value;
    const filter = filterEl.value;
    const enhanceOn = enhanceOnEl.checked;

    const text = (textEl.value || "").trim();
    const textX = parseInt(textXEl.value || "40");
    const textY = parseInt(textYEl.value || "60");
    const textSize = parseInt(textSizeEl.value || "44");

    const imgX = parseInt(imgXEl.value || "100");
    const imgY = parseInt(imgYEl.value || "100");

    const voice = voiceEl.value;

    // Build video filter chain
    const vf = [];

    const crop = getCropForRatio(ratio);
    if (crop) vf.push(crop);

    const enhance = getEnhanceChain(enhanceOn);
    if (enhance) vf.push(enhance);

    const f = getFilterFFmpeg(filter);
    if (f) vf.push(f);

    if (text.length > 0) {
      vf.push(
        `drawtext=text='${text.replace(/'/g, "\\'")}':x=${textX}:y=${textY}:fontsize=${textSize}:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=12`
      );
    }

    // Audio filter
    const af = getVoiceFilter(voice);

    // Args
    const args = [];
    args.push("-i", "input.mp4");
    if (useSticker) args.push("-i", "sticker.png");

    if (trimStart > 0) args.push("-ss", String(trimStart));
    if (trimEnd !== null && trimEnd > trimStart) args.push("-to", String(trimEnd));

    // Filters
    if (useSticker) {
      const baseVF = vf.length ? vf.join(",") : "null";
      const complex = `[0:v]${baseVF}[v0];[v0][1:v]overlay=${imgX}:${imgY}[v]`;

      args.push(
        "-filter_complex", complex,
        "-map", "[v]",
        "-map", "0:a?"
      );
    } else {
      if (vf.length) args.push("-vf", vf.join(","));
    }

    if (af) args.push("-af", af);

    setStatus("Exporting HQ... keep tab open 🔥");

    // Export settings: high quality, less blur
    args.push(
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-r", "30",
      "-b:v", "10000k",
      "-c:a", "aac",
      "-b:a", "192k",
      "output.mp4"
    );

    await ffmpeg.run(...args);

    setStatus("Finalizing download...");

    const data = ffmpeg.FS("readFile", "output.mp4");
    const blob = new Blob([data.buffer], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "nexus_export.mp4";
    document.body.appendChild(a);
    a.click();
    a.remove();

    setStatus("Done ✅ Video downloaded!");
  } catch (err) {
    console.error(err);
    setStatus("Export failed ❌ Try shorter video or restart browser.");
  }

  exportBtn.disabled = false;
});

// default panel
openPanel("upload");
setStatus("Select a video to begin.");
