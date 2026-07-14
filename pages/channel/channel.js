// pages/channel/channel.js
var app = getApp();

Page({
  data: {
    channels: [],
    currentChannelId: null
  },

  onShow: function() {
    this.setData({
      channels: app.globalData.channels,
      currentChannelId: app.globalData.currentChannel ? app.globalData.currentChannel.id : null
    });
  },

  selectChannel: function(e) {
    var id = e.currentTarget.dataset.id;
    var channel = this.data.channels.find(function(c) {
      return c.id === id;
    });

    if (channel) {
      app.globalData.currentChannel = channel;
      wx.setStorageSync('currentChannelId', id);
      this.setData({ currentChannelId: id });
      wx.showToast({ title: '已切换到 ' + channel.name, icon: 'none' });
      setTimeout(function() {
        wx.switchTab({ url: '/pages/talk/talk' });
      }, 800);
    }
  },

  showCreateDialog: function() {
    var self = this;
    wx.showModal({
      title: '创建新频道',
      editable: true,
      placeholderText: '输入频道名称',
      success: function(res) {
        if (res.confirm && res.content) {
          var newId = app.globalData.channels.length + 1;
          var newChannel = {
            id: newId,
            name: res.content,
            members: 0,
            type: 'acoustic'
          };
          app.globalData.channels.push(newChannel);
          wx.setStorageSync('channels', app.globalData.channels);
          self.setData({ channels: app.globalData.channels });
          wx.showToast({ title: '频道已创建', icon: 'success' });
        }
      }
    });
  }
});
