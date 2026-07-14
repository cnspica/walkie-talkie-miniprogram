App({
  globalData: {
    // 当前频道
    currentChannel: null,
    // 用户信息
    userInfo: null,
    // 通信模式: 'acoustic' | 'network'
    commMode: 'acoustic',
    // FSK 参数
    fskConfig: {
      sampleRate: 44100,
      baudRate: 150,
      markFreq: 2100,
      spaceFreq: 1300,
      masterFreq: 100,
      samplesPerBit: 294,
      maxDataBytes: 223
    },
    // 频道列表
    channels: [],
    // WebSocket 连接
    socket: null,
    // 录音管理器
    recorderManager: null,
    // 音频上下文
    innerAudioContext: null,
    // 是否正在监听
    isListening: false,
    // 是否正在发送
    isSending: false
  },

  onLaunch() {
    // 初始化录音管理器
    this.globalData.recorderManager = wx.getRecorderManager();
    this.globalData.innerAudioContext = wx.createInnerAudioContext();

    // 请求麦克风权限
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        console.log('麦克风权限已获取');
      },
      fail: () => {
        console.warn('麦克风权限被拒绝，声学通信功能将不可用');
      }
    });

    // 加载本地存储的频道列表
    const channels = wx.getStorageSync('channels');
    if (channels) {
      this.globalData.channels = channels;
    } else {
      // 默认频道
      this.globalData.channels = [
        { id: 1, name: '公共频道', members: 0, type: 'acoustic' },
        { id: 2, name: '小队频道', members: 0, type: 'acoustic' },
        { id: 3, name: '山顶小队', members: 5, type: 'acoustic' }
      ];
      wx.setStorageSync('channels', this.globalData.channels);
    }

    // 恢复上次频道
    const lastChannel = wx.getStorageSync('currentChannelId');
    if (lastChannel) {
      this.globalData.currentChannel = this.globalData.channels.find(
        c => c.id === lastChannel
      );
    }
  },

  // 切换通信模式
  switchMode(mode) {
    this.globalData.commMode = mode;
    if (mode === 'network') {
      this.connectSocket();
    } else {
      this.disconnectSocket();
    }
  },

  // 连接 WebSocket 信令服务
  connectSocket() {
    if (this.globalData.socket) return;
    this.globalData.socket = wx.connectSocket({
      url: 'wss://your-server.com/walkie-talkie',
      success: () => {
        console.log('WebSocket 连接中...');
      }
    });
  },

  disconnectSocket() {
    if (this.globalData.socket) {
      this.globalData.socket.close();
      this.globalData.socket = null;
    }
  }
});
