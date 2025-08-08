import React, { useState, useRef } from 'react';

function App() {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [aiReply, setAiReply] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorderRef.current = new MediaRecorder(stream);
    audioChunksRef.current = [];

    mediaRecorderRef.current.ondataavailable = (e) => {
      audioChunksRef.current.push(e.data);
    };

    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', audioBlob, 'voice.webm');

      try {
        const response = await fetch('http://localhost:5000/api/converse', {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);

          const audio = new Audio(audioUrl);
          audio.play();

          setTranscript('(AI responded via voice)');
          setAiReply('');
        } else {
          const error = await response.json();
          setTranscript(error?.error || 'Something went wrong.');
          setAiReply('');
        }
      } catch (err) {
        console.error(err);
        setTranscript('Failed to connect to backend.');
        setAiReply('');
      }
    };

    mediaRecorderRef.current.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current.stop();
    setRecording(false);
  };

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>🤝 Malayalam AI Friend</h1>
      <button onClick={startRecording} disabled={recording}>🎙️ Start Talking</button>
      <button onClick={stopRecording} disabled={!recording}>🛑 Stop</button>
      <div style={{ marginTop: 20 }}>
        <p><strong>🗣️ You said:</strong> {transcript}</p>
        <p><strong>🤖 Friend replied:</strong> {aiReply}</p>
      </div>
    </div>
  );
}

export default App;
