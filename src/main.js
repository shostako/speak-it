// speak-it - Text-to-Speech using Web Speech API + Google Cloud TTS

// API Base URL: use backend proxy in production, direct API in development
const API_BASE_URL = import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:3001' : 'https://speak-it-api.onrender.com');

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

    // Audio cache for replay without API call
    this.cachedAudioData = null;    // Float32Array for Google TTS
    this.cachedText = '';           // Text used to generate cached audio
    this.cachedVoice = '';          // Voice used to generate cached audio
    this.cachedRate = 1.0;          // Rate used to generate cached audio

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
      themeToggle: document.getElementById('theme-toggle'),
      downloadBtn: document.getElementById('download-btn'),
      clearBtn: document.getElementById('clear-btn'),
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

    // Initialize theme
    this.initTheme();
  }

  // Theme management
  initTheme() {
    // Check for saved theme preference or system preference
    const savedTheme = localStorage.getItem('speak-it-theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    // Default is dark (no attribute needed)
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    if (newTheme === 'dark') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', newTheme);
    }

    localStorage.setItem('speak-it-theme', newTheme);
  }

  loadBrowserVoices() {
    this.voices = this.synth.getVoices();
  }

  async loadGoogleVoices() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/voices`);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

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
      this.updateClearButtonVisibility();
    });

    // Engine select
    this.elements.engineSelect.addEventListener('change', (e) => {
      this.currentEngine = e.target.value;
      this.updateVoiceList();
      this.stop();
      this.clearCache(); // Clear cache when engine changes
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

    // Theme toggle
    this.elements.themeToggle.addEventListener('click', () => this.toggleTheme());

    // Download button
    this.elements.downloadBtn.addEventListener('click', () => this.download());

    // Clear button
    if (this.elements.clearBtn) {
      this.elements.clearBtn.addEventListener('click', () => this.clearAll());
    }

    // Initialize clear button visibility
    this.updateClearButtonVisibility();
  }

  // マークダウン記号を除去
  stripMarkdown(text) {
    let result = text;

    // 1. コードブロック ```...``` → 中身のみ
    result = result.replace(/```[\s\S]*?```/g, (match) => {
      return match.slice(3, -3).replace(/^\w+\n/, ''); // 言語指定も除去
    });

    // 2. インラインコード `...` → 中身のみ
    result = result.replace(/`([^`]+)`/g, '$1');

    // 3. 画像 ![alt](url) → 除去
    result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');

    // 4. リンク [text](url) → textのみ
    result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // 4.5. YouTubeタイムスタンプ [HH:MM:SS] or [MM:SS] → 除去
    result = result.replace(/\[\d{1,2}:\d{2}(:\d{2})?\]/g, '');

    // 4.6. 区切り記号 : ; （半角・全角）→ 読点に変換（1拍開ける）
    result = result.replace(/[:;：；]/g, '、');

    // 5. 太字 **text** or __text__ → textのみ
    result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
    result = result.replace(/__([^_]+)__/g, '$1');

    // 6. 斜体 *text* or _text_ → textのみ（単語境界を考慮）
    result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');
    result = result.replace(/(?<!_)_([^_]+)_(?!_)/g, '$1');

    // 7. ヘッダー # 〜 ###### （行頭、スペースなしも対応）
    result = result.replace(/^[\s]*#{1,6}\s*/gm, '');

    // 8. リストマーカー - * + （行頭）※番号付きリストは章番号と区別できないため除外
    result = result.replace(/^[\s]*[-*+]\s+/gm, '');

    // 9. 引用 > （行頭）
    result = result.replace(/^>\s*/gm, '');

    // 10. 水平線 --- *** ___
    result = result.replace(/^[-*_]{3,}\s*$/gm, '');

    // 11. 取り消し線 ~~text~~ → textのみ
    result = result.replace(/~~([^~]+)~~/g, '$1');

    // 12. 数学記号を読み上げ文字に変換
    result = result.replace(/[＝=]/g, 'イコール');
    result = result.replace(/[＋+]/g, 'プラス');
    result = result.replace(/[−\u2212\u2013\u2014]/g, 'マイナス'); // U+2212 MINUS, U+2013 EN DASH, U+2014 EM DASH
    result = result.replace(/[×✕]/g, 'かける');
    result = result.replace(/÷/g, 'わる');

    // 13. 改行での休止（句読点がない行末に読点を追加）
    // 空行は維持しつつ、文末に句読点がない単一改行を読点+改行に変換
    result = result.replace(/([^。！？\n])\n(?!\n)/g, '$1、\n');

    // 連続する空行を1つに
    result = result.replace(/\n{3,}/g, '\n\n');

    return result.trim();
  }

  async play() {
    let text = this.elements.textInput.value.trim();
    if (!text) {
      this.showStatus('テキストを入力してください', 'warning');
      return;
    }

    // マークダウン記号を除去
    text = this.stripMarkdown(text);

    // Stop current playback but keep cache
    this.stopPlayback();

    if (this.currentEngine === 'google') {
      const voiceName = this.elements.voiceSelect.value;
      const rate = parseFloat(this.elements.rateSlider.value);
      const volume = parseFloat(this.elements.volumeSlider.value);

      // Check if we can use cached audio
      if (this.cachedAudioData &&
          this.cachedText === text &&
          this.cachedVoice === voiceName &&
          this.cachedRate === rate) {
        this.showStatus('キャッシュから再生...', 'info');
        this.playFromCache(volume);
        return;
      }

      await this.playWithGoogle(text);
    } else {
      this.playWithBrowser(text);
    }
  }

  // Play from cached audio data
  playFromCache(volume) {
    this.isStopped = false;
    this.playConcatenatedAudio(this.cachedAudioData, volume);
  }

  // Stop playback without clearing cache
  stopPlayback() {
    this.isStopped = true;
    if (this.currentEngine === 'google') {
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
      // Note: audioQueue is for streaming, not caching
      this.audioQueue = [];
      this.currentAudioIndex = 0;
    } else {
      this.synth.cancel();
    }
    this.isPlaying = false;
    this.isPaused = false;
    this.updateButtons();
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

  // Call TTS API for a single chunk (via backend proxy)
  async callTTSAPI(text, voiceName, rate) {
    const response = await fetch(`${API_BASE_URL}/api/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voiceName,
        speakingRate: rate
      })
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
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

  // Convert Float32Array to WAV file Blob
  float32ArrayToWav(float32Array, sampleRate = 24000) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = float32Array.length * bytesPerSample;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true);  // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Convert Float32 to Int16 and write
    let offset = 44;
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      const int16 = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, int16, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  // Download audio as WAV file
  async download() {
    let text = this.elements.textInput.value.trim();
    if (!text) {
      this.showStatus('テキストを入力してください', 'warning');
      return;
    }

    // Only Google TTS supports download
    if (this.currentEngine !== 'google') {
      this.showStatus('ダウンロードはGoogle Cloud TTSのみ対応', 'warning');
      return;
    }

    // Strip markdown
    text = this.stripMarkdown(text);

    const voiceName = this.elements.voiceSelect.value;
    const rate = parseFloat(this.elements.rateSlider.value);

    // Disable button during processing
    this.elements.downloadBtn.disabled = true;
    const originalText = this.elements.downloadBtn.textContent;
    this.elements.downloadBtn.textContent = '生成中...';

    try {
      const textBytes = this.getByteLength(text);
      let float32Array;

      if (textBytes <= 4500) {
        // Short text
        this.showStatus('音声を生成中...', 'info');
        const audioContent = await this.callTTSAPI(text, voiceName, rate);
        float32Array = this.base64ToFloat32Array(audioContent);
      } else {
        // Long text - split and concatenate
        const chunks = this.splitTextForTTS(text);
        this.showStatus(`音声を生成中... (0/${chunks.length})`, 'info');

        const audioDataList = await this.generateAllChunks(
          chunks,
          voiceName,
          rate,
          (completed, total) => {
            this.showStatus(`音声を生成中... (${completed}/${total})`, 'info');
          }
        );

        this.showStatus('音声を結合中...', 'info');
        float32Array = this.concatenateAudioBuffers(audioDataList);
      }

      // Apply fade-in
      this.applyFadeIn(float32Array, 1200);

      // Convert to WAV
      const wavBlob = this.float32ArrayToWav(float32Array);

      // Trigger download
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `speak-it-${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showStatus('ダウンロード完了', 'success');

    } catch (error) {
      console.error('Download error:', error);
      this.showStatus(`エラー: ${error.message}`, 'error');
    } finally {
      this.elements.downloadBtn.disabled = false;
      this.elements.downloadBtn.textContent = originalText;
    }
  }

  async playWithGoogle(text) {
    const voiceName = this.elements.voiceSelect.value;
    const rate = parseFloat(this.elements.rateSlider.value);
    const volume = parseFloat(this.elements.volumeSlider.value);

    this.isStopped = false;
    const textBytes = this.getByteLength(text);

    try {
      let float32Array;

      // Short text: single API call
      if (textBytes <= 4500) {
        this.showStatus('音声を生成中...', 'info');
        const audioContent = await this.callTTSAPI(text, voiceName, rate);
        if (this.isStopped) return;
        float32Array = this.base64ToFloat32Array(audioContent);
      } else {
        // Long text: split, generate in parallel, concatenate
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
        float32Array = this.concatenateAudioBuffers(audioDataList);
      }

      if (this.isStopped) return;

      // Apply fade-in
      this.applyFadeIn(float32Array, 1200);

      // Cache the audio data
      this.cachedAudioData = float32Array;
      this.cachedText = text;
      this.cachedVoice = voiceName;
      this.cachedRate = rate;

      // Play the audio
      this.playConcatenatedAudio(float32Array, volume);

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
    // Stop playback but keep cache (can replay with play button)
    this.stopPlayback();
  }

  // Clear cached audio data
  clearCache() {
    this.cachedAudioData = null;
    this.cachedText = '';
    this.cachedVoice = '';
    this.cachedRate = 1.0;
  }

  // Clear all: text, audio cache, and reset state
  clearAll() {
    this.stopPlayback();
    this.clearCache();
    this.elements.textInput.value = '';
    this.elements.charCount.textContent = '0';
    this.updateClearButtonVisibility();
    this.elements.textInput.focus();
    this.showStatus('', 'info');
  }

  // Update clear button visibility based on text content
  updateClearButtonVisibility() {
    if (this.elements.clearBtn) {
      const hasText = this.elements.textInput.value.length > 0;
      this.elements.clearBtn.style.display = hasText ? 'flex' : 'none';
    }
  }

  updateButtons() {
    this.elements.playBtn.disabled = this.isPlaying && !this.isPaused;
    this.elements.pauseBtn.disabled = !this.isPlaying;
    this.elements.stopBtn.disabled = !this.isPlaying;

    if (!this.isPaused) {
      this.elements.pauseBtn.textContent = '⏸ 一時停止';
    }

    // Update visual states for animations
    if (this.isPlaying && !this.isPaused) {
      document.body.classList.add('is-playing');
      this.elements.playBtn.classList.add('is-playing');
    } else {
      document.body.classList.remove('is-playing');
      this.elements.playBtn.classList.remove('is-playing');
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
