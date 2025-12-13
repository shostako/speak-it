// speak-it - Text-to-Speech using Web Speech API + Google Cloud TTS

const GOOGLE_TTS_API_KEY = 'AIzaSyD1lBVQRnVrC36NZsZ95LNA1D__L-cNw8k';

class SpeakIt {
  constructor() {
    this.synth = window.speechSynthesis;
    this.utterance = null;
    this.voices = [];
    this.googleVoices = [];
    this.isPlaying = false;
    this.isPaused = false;
    this.audioElement = null;
    this.audioQueue = [];
    this.currentAudioIndex = 0;
    this.isStopped = false;
    this.currentEngine = 'google'; // 'browser' or 'google'

    this.elements = {
      textInput: document.getElementById('text-input'),
      charCount: document.getElementById('char-count'),
      engineSelect: document.getElementById('engine-select'),
      voiceSelect: document.getElementById('voice-select'),
      rateSlider: document.getElementById('rate-slider'),
      rateValue: document.getElementById('rate-value'),
      volumeSlider: document.getElementById('volume-slider'),
      volumeValue: document.getElementById('volume-value'),
      playBtn: document.getElementById('play-btn'),
      pauseBtn: document.getElementById('pause-btn'),
      stopBtn: document.getElementById('stop-btn'),
      status: document.getElementById('status'),
      browserSupport: document.getElementById('browser-support'),
      audioPlayer: document.getElementById('audio-player'),
    };

    this.init();
  }

  async init() {
    // Check browser support
    if (!this.synth) {
      this.elements.browserSupport.textContent = 'ブラウザ音声: 非対応';
    } else {
      this.elements.browserSupport.textContent = 'ブラウザ音声: 対応';
    }

    // Load browser voices
    this.loadBrowserVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => this.loadBrowserVoices();
    }

    // Load Google voices
    await this.loadGoogleVoices();

    // Event listeners
    this.setupEventListeners();

    // Initial voice list
    this.updateVoiceList();
  }

  loadBrowserVoices() {
    this.voices = this.synth.getVoices();
  }

  async loadGoogleVoices() {
    try {
      const response = await fetch(
        `https://texttospeech.googleapis.com/v1/voices?key=${GOOGLE_TTS_API_KEY}&languageCode=ja-JP`
      );
      const data = await response.json();
      if (data.voices) {
        this.googleVoices = data.voices.filter(v => v.languageCodes.includes('ja-JP'));
        this.showStatus('Google Cloud TTS 準備完了', 'success');
      }
    } catch (error) {
      console.error('Failed to load Google voices:', error);
      this.showStatus('Google TTS の読み込みに失敗', 'error');
    }
  }

  updateVoiceList() {
    const select = this.elements.voiceSelect;
    select.innerHTML = '';

    if (this.currentEngine === 'google') {
      // Google Cloud TTS voices
      const voiceTypes = {
        'Studio': [],
        'Neural2': [],
        'WaveNet': [],
        'Standard': []
      };

      this.googleVoices.forEach(voice => {
        const type = Object.keys(voiceTypes).find(t => voice.name.includes(t)) || 'Standard';
        voiceTypes[type].push(voice);
      });

      Object.entries(voiceTypes).forEach(([type, voices]) => {
        if (voices.length === 0) return;
        const group = document.createElement('optgroup');
        group.label = `${type} (${this.getVoiceTypeDesc(type)})`;
        voices.forEach(voice => {
          const option = document.createElement('option');
          option.value = voice.name;
          const gender = voice.ssmlGender === 'FEMALE' ? '女性' : '男性';
          option.textContent = `${voice.name.split('-').pop()} - ${gender}`;
          group.appendChild(option);
        });
        select.appendChild(group);
      });

      // Default to first Neural2 or WaveNet
      const defaultVoice = this.googleVoices.find(v => v.name.includes('Neural2'))
        || this.googleVoices.find(v => v.name.includes('WaveNet'))
        || this.googleVoices[0];
      if (defaultVoice) {
        select.value = defaultVoice.name;
      }

    } else {
      // Browser voices
      const jaVoices = this.voices.filter(v => v.lang.startsWith('ja'));
      const enVoices = this.voices.filter(v => v.lang.startsWith('en'));

      const addOptions = (voices, groupLabel) => {
        if (voices.length === 0) return;
        const group = document.createElement('optgroup');
        group.label = groupLabel;
        voices.forEach(voice => {
          const option = document.createElement('option');
          option.value = this.voices.indexOf(voice);
          option.textContent = `${voice.name} (${voice.lang})`;
          group.appendChild(option);
        });
        select.appendChild(group);
      };

      addOptions(jaVoices, '日本語');
      addOptions(enVoices, '英語');

      const googleJa = jaVoices.find(v => v.name.includes('Google') && v.lang === 'ja-JP');
      if (googleJa) {
        select.value = this.voices.indexOf(googleJa);
      } else if (jaVoices.length > 0) {
        select.value = this.voices.indexOf(jaVoices[0]);
      }
    }
  }

  getVoiceTypeDesc(type) {
    const descs = {
      'Studio': '最高品質',
      'Neural2': '高品質',
      'WaveNet': '自然',
      'Standard': '標準'
    };
    return descs[type] || '';
  }

  setupEventListeners() {
    // Text input
    this.elements.textInput.addEventListener('input', () => {
      this.elements.charCount.textContent = this.elements.textInput.value.length;
    });

    // Engine select
    this.elements.engineSelect.addEventListener('change', (e) => {
      this.currentEngine = e.target.value;
      this.updateVoiceList();
      this.stop();
    });

    // Rate slider (速度は次の再生から反映、再生中の変更は音程が変わるため無効)
    this.elements.rateSlider.addEventListener('input', (e) => {
      this.elements.rateValue.textContent = e.target.value;
    });

    // Volume slider
    this.elements.volumeSlider.addEventListener('input', (e) => {
      this.elements.volumeValue.textContent = Math.round(e.target.value * 100);
      // Update volume in real-time via GainNode
      if (this.gainNode && this.isPlaying) {
        this.gainNode.gain.value = parseFloat(e.target.value);
      }
    });

    // Play button
    this.elements.playBtn.addEventListener('click', () => this.play());

    // Pause button
    this.elements.pauseBtn.addEventListener('click', () => this.togglePause());

    // Stop button
    this.elements.stopBtn.addEventListener('click', () => this.stop());
  }

  async play() {
    const text = this.elements.textInput.value.trim();
    if (!text) {
      this.showStatus('テキストを入力してください', 'warning');
      return;
    }

    this.stop();

    if (this.currentEngine === 'google') {
      await this.playWithGoogle(text);
    } else {
      this.playWithBrowser(text);
    }
  }

  // Get byte length of text in UTF-8
  getByteLength(text) {
    return new TextEncoder().encode(text).length;
  }

  // Split text into chunks for Google TTS (byte-based for API limit)
  splitTextForTTS(text, maxBytes = 4500) {
    const chunks = [];

    // If text fits in one chunk, return as-is
    if (this.getByteLength(text) <= maxBytes) {
      return [text];
    }

    // Split by paragraphs first
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';

    for (const para of paragraphs) {
      const paraWithBreak = currentChunk ? '\n\n' + para : para;

      if (this.getByteLength(currentChunk + paraWithBreak) <= maxBytes) {
        currentChunk += paraWithBreak;
      } else {
        // Current chunk is full, save it
        if (currentChunk) chunks.push(currentChunk.trim());

        // If single paragraph is too long, split by sentences
        if (this.getByteLength(para) > maxBytes) {
          const sentences = para.split(/(?<=[。！？\n])/);
          currentChunk = '';

          for (const sentence of sentences) {
            if (this.getByteLength(currentChunk + sentence) <= maxBytes) {
              currentChunk += sentence;
            } else {
              if (currentChunk) chunks.push(currentChunk.trim());

              // If single sentence is too long, split by commas
              if (this.getByteLength(sentence) > maxBytes) {
                const parts = sentence.split(/(?<=[、,])/);
                currentChunk = '';

                for (const part of parts) {
                  if (this.getByteLength(currentChunk + part) <= maxBytes) {
                    currentChunk += part;
                  } else {
                    if (currentChunk) chunks.push(currentChunk.trim());
                    // Force split if still too long
                    if (this.getByteLength(part) > maxBytes) {
                      let remaining = part;
                      while (remaining) {
                        let end = Math.floor(maxBytes / 3); // Rough estimate for Japanese
                        while (end > 0 && this.getByteLength(remaining.slice(0, end)) > maxBytes) {
                          end--;
                        }
                        if (end === 0) end = 1; // At least one char
                        chunks.push(remaining.slice(0, end).trim());
                        remaining = remaining.slice(end);
                      }
                      currentChunk = '';
                    } else {
                      currentChunk = part;
                    }
                  }
                }
              } else {
                currentChunk = sentence;
              }
            }
          }
        } else {
          currentChunk = para;
        }
      }
    }

    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks.filter(c => c.length > 0);
  }

  // Call TTS API for a single chunk
  async callTTSAPI(text, voiceName, rate) {
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: 'ja-JP',
            name: voiceName
          },
          audioConfig: {
            audioEncoding: 'LINEAR16',
            speakingRate: rate,
            sampleRateHertz: 24000
          }
        })
      }
    );

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    return data.audioContent;
  }

  // Generate audio for all chunks in parallel
  async generateAllChunks(chunks, voiceName, rate, onProgress) {
    const results = [];
    const total = chunks.length;

    // Process in parallel with progress updates
    const promises = chunks.map(async (chunk, index) => {
      const audioContent = await this.callTTSAPI(chunk, voiceName, rate);
      if (onProgress) {
        onProgress(index + 1, total);
      }
      return { index, audioContent };
    });

    const responses = await Promise.all(promises);

    // Sort by original index to maintain order
    responses.sort((a, b) => a.index - b.index);
    return responses.map(r => r.audioContent);
  }

  // Convert base64 audio to Float32Array
  base64ToFloat32Array(audioContent) {
    const arrayBuffer = this.base64ToArrayBuffer(audioContent);
    const int16Array = new Int16Array(arrayBuffer);
    const float32Array = new Float32Array(int16Array.length);

    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }
    return float32Array;
  }

  // Concatenate multiple audio data into single Float32Array
  concatenateAudioBuffers(audioDataList) {
    // Convert all to Float32Arrays
    const float32Arrays = audioDataList.map(data => this.base64ToFloat32Array(data));

    // Calculate total length
    const totalLength = float32Arrays.reduce((sum, arr) => sum + arr.length, 0);

    // Create combined array
    const combined = new Float32Array(totalLength);
    let offset = 0;

    for (const arr of float32Arrays) {
      combined.set(arr, offset);
      offset += arr.length;
    }

    // Apply fade-in at the start (first 50ms = 1200 samples at 24kHz)
    this.applyFadeIn(combined, 1200);

    return combined;
  }

  // Apply fade-in to audio data to prevent click noise
  applyFadeIn(float32Array, fadeInSamples) {
    const samples = Math.min(fadeInSamples, float32Array.length);
    for (let i = 0; i < samples; i++) {
      float32Array[i] *= i / samples;
    }
  }

  async playWithGoogle(text) {
    const voiceName = this.elements.voiceSelect.value;
    const rate = parseFloat(this.elements.rateSlider.value);
    const volume = parseFloat(this.elements.volumeSlider.value);

    this.isStopped = false;
    const textBytes = this.getByteLength(text);

    try {
      // Short text: single API call (existing behavior)
      if (textBytes <= 4500) {
        this.showStatus('音声を生成中...', 'info');
        const audioContent = await this.callTTSAPI(text, voiceName, rate);
        if (this.isStopped) return;
        this.playSingleAudio(audioContent, volume);
        return;
      }

      // Long text: split, generate in parallel, concatenate, play
      const chunks = this.splitTextForTTS(text);
      console.log(`Long text: ${textBytes} bytes, split into ${chunks.length} chunks`);

      this.showStatus(`音声を生成中... (0/${chunks.length})`, 'info');

      // Generate all chunks in parallel
      const audioDataList = await this.generateAllChunks(
        chunks,
        voiceName,
        rate,
        (completed, total) => {
          if (!this.isStopped) {
            this.showStatus(`音声を生成中... (${completed}/${total})`, 'info');
          }
        }
      );

      if (this.isStopped) return;

      // Concatenate all audio into single buffer
      this.showStatus('音声を結合中...', 'info');
      const concatenatedAudio = this.concatenateAudioBuffers(audioDataList);

      if (this.isStopped) return;

      // Play concatenated audio
      this.playConcatenatedAudio(concatenatedAudio, volume);

    } catch (error) {
      console.error('Google TTS error:', error);
      this.showStatus(`エラー: ${error.message}`, 'error');
    }
  }

  // Play pre-concatenated Float32Array audio
  async playConcatenatedAudio(float32Array, volume) {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const sampleRate = 24000;
      console.log(`Concatenated audio: ${float32Array.length} samples, duration: ${(float32Array.length / sampleRate).toFixed(2)}s`);

      const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32Array);

      this.audioSource = this.audioContext.createBufferSource();
      this.audioSource.buffer = audioBuffer;

      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = volume;

      this.audioSource.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      this.isPlaying = true;
      this.isPaused = false;
      this.targetVolume = volume;
      this.updateButtons();
      this.showStatus('読み上げ中...', 'info');

      this.audioSource.onended = () => {
        console.log('Playback ended normally');
        this.isPlaying = false;
        this.isPaused = false;
        this.updateButtons();
        this.showStatus('読み上げ完了', 'success');
      };

      this.audioSource.start(0);

    } catch (error) {
      console.error('AudioContext error:', error);
      this.isPlaying = false;
      this.updateButtons();
      this.showStatus('音声再生エラー: ' + error.message, 'error');
    }
  }

  async playSingleAudio(audioContent, volume) {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const sampleRate = 24000;
      const arrayBuffer = this.base64ToArrayBuffer(audioContent);
      const int16Array = new Int16Array(arrayBuffer);
      const float32Array = new Float32Array(int16Array.length);

      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      // Apply fade-in at data level (50ms = 1200 samples at 24kHz)
      this.applyFadeIn(float32Array, 1200);

      console.log(`Audio samples: ${float32Array.length}, duration: ${float32Array.length / sampleRate}s`);

      const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32Array);

      this.audioSource = this.audioContext.createBufferSource();
      this.audioSource.buffer = audioBuffer;

      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = volume;

      this.audioSource.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      this.isPlaying = true;
      this.isPaused = false;
      this.targetVolume = volume;
      this.updateButtons();
      this.showStatus('読み上げ中...', 'info');

      this.audioSource.onended = () => {
        console.log('Playback ended normally');
        this.isPlaying = false;
        this.isPaused = false;
        this.updateButtons();
        this.showStatus('読み上げ完了', 'success');
      };

      this.audioSource.start(0);

    } catch (error) {
      console.error('AudioContext error:', error);
      this.isPlaying = false;
      this.updateButtons();
      this.showStatus('音声再生エラー: ' + error.message, 'error');
    }
  }

  // Convert base64 to ArrayBuffer
  base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Schedule all audio chunks to play seamlessly
  async playScheduledAudio(audioDataList, volume) {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const sampleRate = 24000;
      this.scheduledSources = [];

      // Create gain node for volume
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = volume;
      this.gainNode.connect(this.audioContext.destination);

      let startTime = this.audioContext.currentTime;
      let totalDuration = 0;

      // Create and schedule each chunk
      for (let i = 0; i < audioDataList.length; i++) {
        const arrayBuffer = this.base64ToArrayBuffer(audioDataList[i]);
        const int16Array = new Int16Array(arrayBuffer);
        const float32Array = new Float32Array(int16Array.length);

        for (let j = 0; j < int16Array.length; j++) {
          float32Array[j] = int16Array[j] / 32768.0;
        }

        const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, sampleRate);
        audioBuffer.getChannelData(0).set(float32Array);

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.gainNode);

        // Schedule to start at exact time
        source.start(startTime);
        console.log(`Chunk ${i + 1} scheduled at ${startTime.toFixed(3)}s, duration: ${audioBuffer.duration.toFixed(3)}s`);

        this.scheduledSources.push(source);
        startTime += audioBuffer.duration;
        totalDuration += audioBuffer.duration;
      }

      console.log(`Total duration: ${totalDuration.toFixed(3)}s`);

      this.isPlaying = true;
      this.isPaused = false;
      this.updateButtons();
      this.showStatus('読み上げ中...', 'info');

      // Set onended for last source
      const lastSource = this.scheduledSources[this.scheduledSources.length - 1];
      lastSource.onended = () => {
        console.log('Playback ended normally');
        this.isPlaying = false;
        this.isPaused = false;
        this.scheduledSources = [];
        this.updateButtons();
        this.showStatus('読み上げ完了', 'success');
      };

    } catch (error) {
      console.error('AudioContext error:', error);
      this.isPlaying = false;
      this.updateButtons();
      this.showStatus('音声再生エラー: ' + error.message, 'error');
    }
  }

  async playNextInQueue(volume, totalChunks) {
    if (this.isStopped || this.currentAudioIndex >= this.audioQueue.length) {
      if (!this.isStopped) {
        this.isPlaying = false;
        this.isPaused = false;
        this.updateButtons();
        this.showStatus('読み上げ完了', 'success');
      }
      return;
    }

    const audioContent = this.audioQueue[this.currentAudioIndex];

    // Debug: log the audio data size
    console.log(`Chunk ${this.currentAudioIndex + 1}: base64 length = ${audioContent.length}`);

    try {
      // Use AudioContext API for reliable playback
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      // Resume AudioContext if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const arrayBuffer = this.base64ToArrayBuffer(audioContent);
      console.log(`ArrayBuffer size: ${arrayBuffer.byteLength} bytes`);

      // LINEAR16 is raw PCM, create AudioBuffer manually
      const sampleRate = 24000;
      const int16Array = new Int16Array(arrayBuffer);
      const float32Array = new Float32Array(int16Array.length);

      // Convert Int16 to Float32 (-1.0 to 1.0)
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32Array);

      console.log(`Chunk ${this.currentAudioIndex + 1} decoded, duration: ${audioBuffer.duration}s, samples: ${float32Array.length}`);

      // Create source node
      this.audioSource = this.audioContext.createBufferSource();
      this.audioSource.buffer = audioBuffer;

      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = volume;

      // Connect: source -> gain -> destination
      this.audioSource.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      this.isPlaying = true;
      this.isPaused = false;
      this.updateButtons();
      this.showStatus(`読み上げ中... (${this.currentAudioIndex + 1}/${totalChunks})`, 'info');

      // When finished, play next chunk
      this.audioSource.onended = () => {
        console.log(`Chunk ${this.currentAudioIndex + 1} ended normally`);
        this.currentAudioIndex++;
        this.playNextInQueue(volume, totalChunks);
      };

      this.audioSource.start(0);

    } catch (error) {
      console.error('AudioContext error:', error);
      this.isPlaying = false;
      this.updateButtons();
      this.showStatus('音声再生エラー: ' + error.message, 'error');
    }
  }

  playWithBrowser(text) {
    this.utterance = new SpeechSynthesisUtterance(text);

    const voiceIndex = this.elements.voiceSelect.value;
    if (voiceIndex && this.voices[voiceIndex]) {
      this.utterance.voice = this.voices[voiceIndex];
    }

    this.utterance.rate = parseFloat(this.elements.rateSlider.value);
    this.utterance.volume = parseFloat(this.elements.volumeSlider.value);

    this.utterance.onstart = () => {
      this.isPlaying = true;
      this.isPaused = false;
      this.updateButtons();
      this.showStatus('読み上げ中...', 'info');
    };

    this.utterance.onend = () => {
      this.isPlaying = false;
      this.isPaused = false;
      this.updateButtons();
      this.showStatus('読み上げ完了', 'success');
    };

    this.utterance.onerror = (e) => {
      this.isPlaying = false;
      this.isPaused = false;
      this.updateButtons();
      this.showStatus(`エラー: ${e.error}`, 'error');
    };

    this.synth.speak(this.utterance);
  }

  async togglePause() {
    if (this.currentEngine === 'google') {
      // Use AudioContext suspend/resume for pause functionality
      if (this.audioContext) {
        if (this.isPaused) {
          await this.audioContext.resume();
          this.isPaused = false;
          this.elements.pauseBtn.textContent = '⏸ 一時停止';
          this.showStatus('読み上げ中...', 'info');
        } else {
          await this.audioContext.suspend();
          this.isPaused = true;
          this.elements.pauseBtn.textContent = '▶ 再開';
          this.showStatus('一時停止中', 'info');
        }
      }
    } else {
      if (this.isPaused) {
        this.synth.resume();
        this.isPaused = false;
        this.elements.pauseBtn.textContent = '⏸ 一時停止';
        this.showStatus('読み上げ中...', 'info');
      } else {
        this.synth.pause();
        this.isPaused = true;
        this.elements.pauseBtn.textContent = '▶ 再開';
        this.showStatus('一時停止中', 'info');
      }
    }
  }

  stop() {
    this.isStopped = true;
    if (this.currentEngine === 'google') {
      // Stop all scheduled sources
      if (this.scheduledSources) {
        for (const source of this.scheduledSources) {
          try {
            source.stop();
          } catch (e) {
            // Already stopped
          }
        }
        this.scheduledSources = [];
      }
      if (this.audioSource) {
        try {
          this.audioSource.stop();
        } catch (e) {
          // Already stopped
        }
        this.audioSource = null;
      }
      this.audioQueue = [];
      this.currentAudioIndex = 0;
    } else {
      this.synth.cancel();
    }
    this.isPlaying = false;
    this.isPaused = false;
    this.updateButtons();
  }

  updateButtons() {
    this.elements.playBtn.disabled = this.isPlaying && !this.isPaused;
    this.elements.pauseBtn.disabled = !this.isPlaying;
    this.elements.stopBtn.disabled = !this.isPlaying;

    if (!this.isPaused) {
      this.elements.pauseBtn.textContent = '⏸ 一時停止';
    }
  }

  showStatus(message, type = 'info') {
    this.elements.status.textContent = message;
    this.elements.status.className = `status status-${type}`;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new SpeakIt();
});
