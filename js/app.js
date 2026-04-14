import { FFmpeg } from 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';
import { fetchFile } from 'https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js';

// UI Elements
const ffmpeg = new FFmpeg();
const fileInput = document.getElementById('video-upload');
const fileNameDisplay = document.getElementById('file-name-display');
const statusDisplay = document.getElementById('status');
const progressBar = document.getElementById('progress');
const previewVideo = document.getElementById('video-preview');
const githubBadge = document.getElementById('github-badge');
const statsArea = document.getElementById('stats-area');
const downloadArea = document.getElementById('download-area');

const btns = {
    github: document.getElementById('btn-github'),
    high: document.getElementById('btn-high'),
    balanced: document.getElementById('btn-balanced'),
    quality: document.getElementById('btn-quality')
};

let isWasmLoaded = false;

// Helper: Measure video duration for bitrate calculation
const getVideoDuration = (file) => new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration);
    };
    video.src = URL.createObjectURL(file);
});

function setButtonsState(disabled) {
    const shouldDisable = disabled || !isWasmLoaded || !fileInput.files[0];
    Object.values(btns).forEach(btn => btn.disabled = shouldDisable);
}

// Event: File selection
fileInput.addEventListener('change', function(e) {
    fileNameDisplay.innerText = e.target.files[0] ? e.target.files[0].name : 'No file selected';
    setButtonsState(false);
    statsArea.style.display = 'none';
    githubBadge.style.display = 'none';
    previewVideo.style.display = 'none';
    downloadArea.innerHTML = '';
});

// Step 1: Initialize FFmpeg with LOCAL files
async function init() {
    try {
        ffmpeg.on('log', ({ message }) => console.log(message));
        ffmpeg.on('progress', ({ progress: p }) => {
            progressBar.value = p * 100;
            statusDisplay.innerText = `Processing: ${Math.round(p * 100)}%`;
        });

        // CRITICAL: Using local paths to bypass browser security
        await ffmpeg.load({
            coreURL: './js/ffmpeg-core.js',
            wasmURL: './js/ffmpeg-core.wasm',
            workerURL: './js/worker.js'
        });

        isWasmLoaded = true;
        statusDisplay.innerText = "✅ System ready. Select a video.";
        statusDisplay.style.color = "#2da44e";
        setButtonsState(false); 
    } catch (err) {
        statusDisplay.innerText = "❌ Initialization failed.";
        console.error("FFmpeg Load Error:", err);
    }
}

// Step 2: Core Processing Logic
async function processVideo(mode) {
    const videoFile = fileInput.files[0];
    if (!videoFile) return alert('Please select a video file first!');

    const inputSizeMB = videoFile.size / (1024 * 1024);
    setButtonsState(true);
    githubBadge.style.display = "none";
    statsArea.style.display = "none";
    progressBar.style.display = "block";
    statusDisplay.innerText = "⚡ Preparing system...";
    statusDisplay.style.color = "#3c4043";

    try {
        const duration = await getVideoDuration(videoFile);
        
        try { await ffmpeg.createDir('/work'); } catch (e) {}
        
        // Load file into WASM virtual filesystem
        const fileData = await fetchFile(videoFile);
        await ffmpeg.writeFile(`/work/${videoFile.name}`, fileData);
        
        const inputPath = `/work/${videoFile.name}`;
        let command = ['-i', inputPath];

        // Algorithm: Smart Compression for GitHub (<10MB)
        if (mode === 'smart_github') {
            if (inputSizeMB <= 9.5) {
                statusDisplay.innerText = "Optimizing format only...";
                command.push('-c:v', 'libx264', '-crf', '22', '-preset', 'ultrafast', '-threads', '2');
            } else {
                const targetMB = 9.5;
                const targetKbits = targetMB * 8192;
                const audioKbps = 128; 
                let videoKbps = Math.floor((targetKbits / duration) - audioKbps);
                if (videoKbps < 50) videoKbps = 50; 

                statusDisplay.innerText = `Target bitrate: ${videoKbps} kbps...`;

                let scaleCmd = "scale='min(1280,iw)':-2";
                if (videoKbps < 400) scaleCmd = "scale='min(854,iw)':-2";

                command.push(
                    '-vf', scaleCmd,
                    '-c:v', 'libx264',
                    '-b:v', `${videoKbps}k`,
                    '-maxrate', `${Math.floor(videoKbps * 1.5)}k`,
                    '-bufsize', `${videoKbps * 2}k`,
                    '-preset', 'ultrafast',
                    '-tune', 'fastdecode',
                    '-pix_fmt', 'yuv420p',
                    '-threads', '2' // Thermal protection
                );
            }
        } else if (mode === 'high_compression') {
            command.push('-vf', "scale='min(854,iw)':-2", '-c:v', 'libx264', '-crf', '30', '-preset', 'ultrafast', '-threads', '2');
        } else if (mode === 'balanced') {
            command.push('-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-crf', '26', '-preset', 'ultrafast', '-threads', '2');
        } else if (mode === 'high_quality') {
            command.push('-c:v', 'libx264', '-crf', '22', '-preset', 'ultrafast', '-threads', '2');
        }

        command.push('output.mp4');
        const startTime = Date.now();
        
        // Execute FFmpeg process
        await ffmpeg.exec(command);
        
        const processTime = ((Date.now() - startTime) / 1000).toFixed(1);

        // Read resulting file
        const outputData = await ffmpeg.readFile('output.mp4');
        const outputSizeMB = outputData.length / (1024 * 1024);
        const reductionPercent = (((inputSizeMB - outputSizeMB) / inputSizeMB) * 100).toFixed(0);
        
        // Create Blob URL for preview and download
        const videoURL = URL.createObjectURL(new Blob([outputData.buffer], { type: 'video/mp4' }));

        // Update UI with results
        statusDisplay.innerText = `✨ Done in ${processTime}s`;
        
        document.getElementById('stat-before').innerText = `${inputSizeMB.toFixed(1)} MB`;
        document.getElementById('stat-after').innerText = `${outputSizeMB.toFixed(1)} MB`;
        document.getElementById('stat-reduction').innerText = `%${reductionPercent}`;
        statsArea.style.display = "flex";
        
        previewVideo.src = videoURL;
        previewVideo.style.display = "block";
        
        if (outputSizeMB <= 10.2) githubBadge.style.display = "block";
        
        downloadArea.innerHTML = `
            <a href="${videoURL}" download="gitshrink_output.mp4" class="btn-primary" style="display:inline-block; text-decoration:none; margin-top:15px;">
                💾 Download MP4
            </a>`;
            
    } catch (err) {
        statusDisplay.innerText = "❌ Processing error.";
        console.error(err);
    } finally {
        // Memory management: cleanup files
        try { 
            await ffmpeg.deleteFile(`/work/${videoFile.name}`);
            await ffmpeg.deleteFile('output.mp4');
            await ffmpeg.deleteDir('/work'); 
        } catch (e) {}
        
        setButtonsState(false);
        progressBar.style.display = "none";
    }
}

// Bind buttons
btns.github.onclick = () => processVideo('smart_github');
btns.high.onclick = () => processVideo('high_compression');
btns.balanced.onclick = () => processVideo('balanced');
btns.quality.onclick = () => processVideo('high_quality');

// Start the engine
init();
