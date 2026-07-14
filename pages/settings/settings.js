// pages/settings/settings.js
var app = getApp();

Page({
  data: {
    fskConfig: {
      sampleRate: 44100,
      baudRate: 150,
      markFreq: 2100,
      spaceFreq: 1300,
      maxDataBytes: 223
    },
    dingEnabled: true,
    highSpeed: false,
    vibrateEnabled: true,
    volume: 100
  },

  onLoad: function() {
    this.setData({
      fskConfig: app.globalData.fskConfig,
      dingEnabled: wx.getStorageSync('dingEnabled') !== false,
      highSpeed: wx.getStorageSync('highSpeed') === true,
      vibrateEnabled: wx.getStorageSync('vibrateEnabled') !== false,
      volume: wx.getStorageSync('volume') || 100
    });

    if (this.data.highSpeed) {
      this.setData({ 'fskConfig.baudRate': 300 });
    }
  },

  toggleDing: function(e) {
    this.setData({ dingEnabled: e.detail.value });
    wx.setStorageSync('dingEnabled', e.detail.value);
  },

  toggleHighSpeed: function(e) {
    this.setData({
      highSpeed: e.detail.value,
      'fskConfig.baudRate': e.detail.value ? 300 : 150
    });
    wx.setStorageSync('highSpeed', e.detail.value);
    app.globalData.fskConfig.baudRate = e.detail.value ? 300 : 150;
  },

  toggleVibrate: function(e) {
    this.setData({ vibrateEnabled: e.detail.value });
    wx.setStorageSync('vibrateEnabled', e.detail.value);
  },

  onVolumeChange: function(e) {
    this.setData({ volume: e.detail.value });
    wx.setStorageSync('volume', e.detail.value);
  }
});
