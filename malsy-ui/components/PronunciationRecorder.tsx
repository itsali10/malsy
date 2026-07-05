'use client';

import { useCallback, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';

interface PronunciationRecorderProps {
  sentence: string;
  disabled?: boolean;
  onRecorded: (audioBase64: string) => void;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const data = reader.result as string;
      const base64 = data.includes(',') ? data.split(',')[1] : data;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function PronunciationRecorder({
  sentence,
  disabled = false,
  onRecorded,
}: PronunciationRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        try {
          const b64 = await blobToBase64(blob);
          onRecorded(b64);
        } catch {
          setError('Could not process recording.');
        }
        setRecording(false);
      };
      mediaRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError('Microphone access is required for pronunciation practice.');
    }
  }, [onRecorded]);

  const stopRecording = useCallback(() => {
    mediaRef.current?.stop();
    mediaRef.current = null;
  }, []);

  return (
    <div className="lesson-pronunciation">
      <p className="lesson-pronunciation__prompt">Say this aloud:</p>
      <p className="lesson-pronunciation__sentence">{sentence}</p>
      <button
        type="button"
        className={`lesson-pronunciation__mic${recording ? ' lesson-pronunciation__mic--active' : ''}`}
        disabled={disabled}
        onClick={recording ? stopRecording : startRecording}
      >
        {recording ? <Square size={22} aria-hidden /> : <Mic size={22} aria-hidden />}
        {recording ? 'Stop & Submit' : 'Tap to Record'}
      </button>
      {error && <p className="lesson-pronunciation__error">{error}</p>}
    </div>
  );
}
