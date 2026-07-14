// pages/talk/talk.js
var FSK = require('../../utils/fsk.js');
var FSKModulator = FSK.FSKModulator;
var FSKDemodulator = FSK.FSKDemodulator;
var MessageBuilder = FSK.MessageBuilder;
var generateWAV = FSK.generateWAV;

var app = getApp();

Page({
  data: {
    channel: null,
    messages: [],
    commMode: 'acoustic',
    modeText: '声学模式',
    showModePanel: false,
    inputText: '',
    isTransmitting: false,
    transmitProgress: 0,
    isPTTActive: false,
    isListening: false,
    listenStatus: '监听中',
    currentFreq: '----',
    scrollToId: ''
  },

  // FSK 引擎实例
  modulator: null,
  demodulator: null,
  audioContext: null,
  recorderManager: null,
  msgCounter: 0,
  waveAnimationTimer: null,

  onLoad: function() {
    // 初始化 FSK 引擎
    this.modulator = new FSKModulator(false);
    this.demodulator = new FSKDemodulator();

    // 获取录音管理器
    this.recorderManager = wx.getRecorderManager();

    // 录音回调
    this.recorderManager.onFrameRecorded(this.onAudioFrame.bind(this));
    this.recorderManager.onStop(this.onRecordStop.bind(this));

    // 获取当前频道
    this.updateChannel();
  },

  onShow: function() {
    this.updateChannel();
    this.updateMode();

    // 声学模式自动开始监听
    if (this.data.commMode === 'acoustic' && !this.data.isListening) {
      this.startListening();
    }

    // 启动波形动画
    this.startWaveAnimation();
  },

  onHide: function() {
    this.stopListening();
    this.stopWaveAnimation();
  },

  onUnload: function() {
    this.stopListening();
    this.stopWaveAnimation();
  },

  updateChannel: function() {
    var channel = app.globalData.currentChannel;
    this.setData({ channel: channel });
  },

  updateMode: function() {
    var mode = app.globalData.commMode;
    this.setData({
      commMode: mode,
      modeText: mode === 'acoustic' ? '声学模式' : '网络模式'
    });
  },

  toggleModePanel: function() {
    this.setData({ showModePanel: !this.data.showModePanel });
  },

  switchMode: function(e) {
    var mode = e.currentTarget.dataset.mode;
    app.switchMode(mode);
    this.setData({
      commMode: mode,
      modeText: mode === 'acoustic' ? '声学模式' : '网络模式',
      showModePanel: false
    });

    if (mode === 'acoustic') {
      this.startListening();
    } else {
      this.stopListening();
    }
  },

  onInput: function(e) {
    this.setData({ inputText: e.detail.value });
  },

  /**
   * 发送文本消息（声学FSK模式）
   */
  sendText: function() {
    var text = this.data.inputText.trim();
    if (!text) {
      wx.showToast({ title: '请输入消息', icon: 'none' });
      return;
    }

    if (!this.data.channel) {
      wx.showToast({ title: '请先选择频道', icon: 'none' });
      return;
    }

    // 检查字节数
    var builder = new MessageBuilder(this.modulator, false);
    builder.setBytesFromText(text);

    if (builder.bytes.length > 223) {
      wx.showToast({ title: '消息过长（超过223字节）', icon: 'none' });
      return;
    }

    this.setData({ isTransmitting: true, transmitProgress: 0 });

    // 构建 FSK 帧
    builder.build();

    // 生成 PCM 采样
    var samples = this.modulator.generateSamples(true); // withDing=true

    // 生成 WAV 文件
    var wavBuffer = generateWAV(samples, 44100);

    // 保存到临时文件
    var fs = wx.getFileSystemManager();
    var tempPath = wx.env.USER_DATA_PATH + '/fsk_temp.wav';

    var self = this;
    fs.writeFile({
      filePath: tempPath,
      data: wavBuffer,
      encoding: 'binary',
      success: function() {
        // 播放音频
        self.playAudio(tempPath, text);
      },
      fail: function(err) {
        console.error('写入WAV文件失败:', err);
        self.setData({ isTransmitting: false });
        wx.showToast({ title: '发送失败', icon: 'none' });
      }
    });

    // 模拟进度
    this.animateProgress();
  },

  animateProgress: function() {
    var self = this;
    var progress = 0;
    var timer = setInterval(function() {
      progress += 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(timer);
      }
      self.setData({ transmitProgress: progress });
    }, 50);
  },

  playAudio: function(filePath, text) {
    var self = this;

    // 停止监听避免回声
    this.stopListening();

    if (this.audioContext) {
      this.audioContext.stop();
    }

    this.audioContext = wx.createInnerAudioContext();
    this.audioContext.src = filePath;
    this.audioContext.volume = 1.0;

    this.audioContext.onEnded(function() {
      self.onSendComplete(text);
    });

    this.audioContext.onError(function(err) {
      console.error('音频播放错误:', err);
      self.onSendComplete(text);
    });

    this.audioContext.play();
  },

  onSendComplete: function(text) {
    // 添加到消息列表
    var now = new Date();
    var time = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');

    var msg = {
      id: ++this.msgCounter,
      sender: '我',
      time: time,
      text: text,
      isSelf: true
    };

    var messages = this.data.messages.concat(msg);
    this.setData({
      messages: messages,
      isTransmitting: false,
      transmitProgress: 0,
      inputText: '',
      scrollToId: 'msg-' + msg.id
    });

    // 恢复监听
    if (this.data.commMode === 'acoustic') {
      setTimeout(function() {
        this.startListening();
      }.bind(this), 500);
    }
  },

  /**
   * PTT 按下 - 开始语音发送
   */
  startPTT: function() {
    if (!this.data.channel) return;

    this.setData({ isPTTActive: true });

    if (this.data.commMode === 'acoustic') {
      // 声学模式：录音用于后续 FSK 编码
      this.stopListening();
      this.recorderManager.start({
        sampleRate: 44100,
        numberOfChannels: 1,
        encodeBitRate: 16,
        format: 'PCM',
        frameSize: 10
      });
    } else {
      // 网络模式：通过 WebSocket 发送语音流
      this.startNetworkVoice();
    }
  },

  /**
   * PTT 松开 - 结束语音发送
   */
  endPTT: function() {
    if (!this.data.isPTTActive) return;

    this.setData({ isPTTActive: false });

    if (this.data.commMode === 'acoustic') {
      this.recorderManager.stop();
    } else {
      this.stopNetworkVoice();
    }
  },

  /**
   * 开始监听（声学模式接收）
   */
  startListening: function() {
    if (this.data.isListening || this.data.isPTTActive) return;

    this.setData({
      isListening: true,
      listenStatus: '监听中'
    });

    // 开始持续录音（帧模式）
    this.recorderManager.start({
      sampleRate: 44100,
      numberOfChannels: 1,
      encodeBitRate: 16,
      format: 'PCM',
      frameSize: 20
    });
  },

  stopListening: function() {
    if (!this.data.isListening) return;

    this.setData({
      isListening: false,
      listenStatus: '已暂停'
    });

    try {
      this.recorderManager.stop();
    } catch (e) {
      // 忽略
    }
  },

  /**
   * 录音帧回调 - FSK 解调
   */
  onAudioFrame: function(res) {
    if (!this.data.isListening) return;

    var frameBuffer = res.frameBuffer;
    if (!frameBuffer) return;

    // 将 ArrayBuffer 转为 Int16Array
    var samples = new Int16Array(frameBuffer);

    // 转为普通数组
    var sampleArray = [];
    for (var i = 0; i < samples.length; i++) {
      sampleArray.push(samples[i]);
    }

    // FSK 解调
    var bits = this.demodulator.demodulate(sampleArray);

    // 尝试提取帧
    var frame = this.demodulator.extractFrame(bits);

    if (frame) {
      // RS 解码
      var RS = require('../../utils/rscode.js');
      var fullBlock = frame.data.concat(frame.parity);
      var result = RS.ReedSolomonDecoder.decode(fullBlock);

      if (result.errors >= 0) {
        // 还原文本
        var bytes = result.data.slice(0, frame.dataLength);
        var text = this.bytesToText(bytes);

        if (text) {
          this.onMessageReceived(text, result.errors);
        }
      }
    }

    // 更新波形显示
    this.updateWaveform(sampleArray);
  },

  onRecordStop: function(res) {
    // 录音停止回调
  },

  /**
   * 字节数组还原为文本
   */
  bytesToText: function(bytes) {
    var str = '';
    for (var i = 0; i < bytes.length; i++) {
      str += '%' + bytes[i].toString(16).padStart(2, '0');
    }
    try {
      return decodeURI(str);
    } catch (e) {
      console.error('文本解码失败:', e);
      return null;
    }
  },

  onMessageReceived: function(text, errorCount) {
    var now = new Date();
    var time = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');

    var msg = {
      id: ++this.msgCounter,
      sender: '匿名用户',
      time: time,
      text: text,
      isSelf: false
    };

    var messages = this.data.messages.concat(msg);
    this.setData({
      messages: messages,
      scrollToId: 'msg-' + msg.id
    });

    // 震动提示
    wx.vibrateShort();

    if (errorCount > 0) {
      wx.showToast({
        title: '已纠错' + errorCount + '字节',
        icon: 'none',
        duration: 1500
      });
    }
  },

  /**
   * 波形动画
   */
  startWaveAnimation: function() {
    var self = this;
    this.stopWaveAnimation();

    this.waveAnimationTimer = setInterval(function() {
      if (!self.data.isListening) return;

      // 模拟频率显示
      var freq = Math.random() > 0.95 ?
        (Math.random() > 0.5 ? '2100' : '1300') : '----';
      self.setData({ currentFreq: freq });
    }, 100);
  },

  stopWaveAnimation: function() {
    if (this.waveAnimationTimer) {
      clearInterval(this.waveAnimationTimer);
      this.waveAnimationTimer = null;
    }
  },

  updateWaveform: function(samples) {
    var ctx = wx.createCanvasContext('waveform', this);
    var width = 300;
    var height = 60;
    var centerY = height / 2;

    ctx.setStrokeStyle('#5DCAA5');
    ctx.setLineWidth(1.5);
    ctx.beginPath();

    var step = Math.floor(samples.length / width);
    for (var i = 0; i < width; i++) {
      var sample = samples[i * step] || 0;
      var y = centerY + (sample / 32768) * (height / 2 - 4);
      if (i === 0) {
        ctx.moveTo(i, y);
      } else {
        ctx.lineTo(i, y);
      }
    }

    ctx.stroke();
    ctx.draw();
  },

  /**
   * 网络模式语音
   */
  startNetworkVoice: function() {
    var socket = app.globalData.socket;
    if (!socket) {
      wx.showToast({ title: '未连接服务器', icon: 'none' });
      return;
    }

    this.recorderManager.start({
      sampleRate: 44100,
      numberOfChannels: 1,
      encodeBitRate: 16000,
      format: 'aac',
      frameSize: 5
    });

    // 标记开始发送语音
    socket.send({
      data: JSON.stringify({
        type: 'ptt_start',
        channel: this.data.channel.id
      })
    });
  },

  stopNetworkVoice: function() {
    this.recorderManager.stop();

    var socket = app.globalData.socket;
    if (socket) {
      socket.send({
        data: JSON.stringify({
          type: 'ptt_end',
          channel: this.data.channel.id
        })
      });
    }
  }
});
