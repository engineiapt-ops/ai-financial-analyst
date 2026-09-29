import React, { useState, useEffect } from 'react';
import { X, Play, Square, Loader2, Volume2, Sparkles, Mic, Headphones } from 'lucide-react';
import { playAudioBase64, stopAudio } from '../utils/audioPlayer';

interface AudioBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultText: string;
  ticker: string;
}

export const AudioBriefingModal: React.FC<AudioBriefingModalProps> = ({
  isOpen,
  onClose,
  defaultText,
  ticker
}) => {
  const [inputText, setInputText] = useState(defaultText);
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [scriptText, setScriptText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultText) {
      setInputText(defaultText);
    }
  }, [defaultText]);

  useEffect(() => {
    if (!isOpen) {
      stopAudio();
      setIsPlaying(false);
    }
  }, [isOpen]);

  const handleGenerateAudio = async () => {
    setLoading(true);
    setError(null);
    stopAudio();
    setIsPlaying(false);

    try {
      const res = await fetch('/api/briefing/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText || `Generate morning briefing for ticker ${ticker}`,
          title: `Executive Briefing on ${ticker}`
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to generate TTS audio');
      }

      setAudioBase64(data.audioBase64);
      setScriptText(data.scriptText);

      // Auto play
      if (data.audioBase64) {
        setIsPlaying(true);
        playAudioBase64(data.audioBase64, () => setIsPlaying(false));
      }
    } catch (err: any) {
      setError(err.message || 'TTS generation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      stopAudio();
      setIsPlaying(false);
    } else if (audioBase64) {
      setIsPlaying(true);
      playAudioBase64(audioBase64, () => setIsPlaying(false));
    } else {
      handleGenerateAudio();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Headphones className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Executive Voice Briefing
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Gemini TTS
                </span>
              </h3>
              <p className="text-xs text-slate-400">Institutional morning voiceover memo for {ticker}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
              {error}
            </div>
          )}

          {/* Audio Visualizer & Controls */}
          <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-center space-y-4">
            <div className="flex items-center gap-1.5 h-12">
              {[...Array(24)].map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 rounded-full transition-all duration-150 ${
                    isPlaying
                      ? 'bg-gradient-to-t from-emerald-500 to-teal-300'
                      : 'bg-slate-700'
                  }`}
                  style={{
                    height: isPlaying ? `${Math.max(15, (Math.sin(i + Date.now()) * 0.5 + 0.5) * 45)}px` : '10px',
                    animationDuration: `${0.4 + (i % 4) * 0.2}s`
                  }}
                />
              ))}
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handleTogglePlay}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 shadow-lg shadow-emerald-500/20 transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Synthesizing Audio...
                  </>
                ) : isPlaying ? (
                  <>
                    <Square className="h-4 w-4 fill-current" />
                    Stop Briefing
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    {audioBase64 ? 'Replay Briefing' : 'Generate & Listen'}
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Voice persona: Senior Managing Director (Wall Street Morning Call)
            </p>
          </div>

          {/* Script Display */}
          {scriptText ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Executive Spoken Script:</label>
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-200 max-h-36 overflow-y-auto leading-relaxed">
                "{scriptText}"
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Custom Briefing Focus / Source Material:</label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={4}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed font-sans"
                placeholder="Enter financial summary or bullet points for the audio briefing..."
              />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-950/40 text-xs text-slate-500">
          <span>Target Ticker: ${ticker}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
