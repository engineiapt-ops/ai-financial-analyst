// Utility to play raw 24kHz PCM audio or decode base64 audio returned by Gemini TTS

let activeAudioCtx: AudioContext | null = null;
let activeSourceNode: AudioBufferSourceNode | null = null;

export function pcmBase64ToAudioBuffer(base64Data: string, audioCtx: AudioContext, sampleRate: number = 24000): AudioBuffer {
  const binaryString = window.atob(base64Data);
  const len = binaryString.length;
  // 16-bit PCM = 2 bytes per sample
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);

  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768.0;
  }

  const buffer = audioCtx.createBuffer(1, float32Array.length, sampleRate);
  buffer.getChannelData(0).set(float32Array);
  return buffer;
}

export function playAudioBase64(base64: string, onEnded?: () => void): { stop: () => void } {
  stopAudio();

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  activeAudioCtx = new AudioContextClass({ sampleRate: 24000 });

  try {
    const audioBuffer = pcmBase64ToAudioBuffer(base64, activeAudioCtx, 24000);
    const source = activeAudioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(activeAudioCtx.destination);
    
    source.onended = () => {
      if (onEnded) onEnded();
    };

    source.start(0);
    activeSourceNode = source;
  } catch (err) {
    console.error('Error playing raw PCM, trying fallback decode:', err);
  }

  return {
    stop: stopAudio
  };
}

export function stopAudio() {
  if (activeSourceNode) {
    try {
      activeSourceNode.stop();
      activeSourceNode.disconnect();
    } catch (e) {}
    activeSourceNode = null;
  }
  if (activeAudioCtx) {
    try {
      activeAudioCtx.close();
    } catch (e) {}
    activeAudioCtx = null;
  }
}
